/* eslint-disable prettier/prettier */
/* eslint-disable no-unused-vars */
import macro from 'vtk.js/Sources/macros';
import * as vtkMath from 'vtk.js/Sources/Common/Core/Math';
import vtkCellArray from 'vtk.js/Sources/Common/Core/CellArray';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import { VtkDataTypes } from 'vtk.js/Sources/Common/Core/DataArray/Constants';
import vtkPoints from 'vtk.js/Sources/Common/Core/Points';
import vtkDataSetAttributes from 'vtk.js/Sources/Common/DataModel/DataSetAttributes';
import vtkPolyData from 'vtk.js/Sources/Common/DataModel/PolyData';
import vtkContourTriangulator from 'vtk.js/Sources/Filters/General/ContourTriangulator';

import Constants from './Constants';
import CCSEdgeLocator from './ccsEdgeLocator';

const { vtkErrorMacro, capitalize } = macro;
const { ScalarMode } = Constants;

function vtkClipClosedSurface(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkClipClosedSurface');

  publicAPI.getMTime = () =>
    model.clippingPlanes.reduce(
      (a, b) => (b.getMTime() > a ? b.getMTime() : a),
      model.mtime
    );

  /**
   * Take three colors as doubles, and convert to unsigned char.
   *
   * @param {Number} color1
   * @param {Number} color2
   * @param {Number} color3
   * @param {Number[3][3]} colors
   */
  function createColorValues(color1, color2, color3, colors) {
    const dcolors = [color1, color2, color3];
    // console.log('dcolors', dcolors);
    const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        colors[i][j] = Math.round(clamp(dcolors[i][j], 0, 1) * 255);
      }
    }
  }

  /**
   * Point interpolation for clipping and contouring, given the scalar
   * values (v0, v1) for the two endpoints (p0, p1).  The use of this
   * function guarantees perfect consistency in the results.
   *
   * @param {vtkPoints} points
   * @param {vtkDataArray} pointData
   * @param {CCSEdgeLocator} locator
   * @param {Number} tol
   * @param {Number} i0
   * @param {Number} i1
   * @param {Number} v0
   * @param {Number} v1
   * @param {Number} i
   * @returns {Number}
   */
  function interpolateEdge(points, pointData, locator, tol, i0, i1, v0, v1) {
    // This swap guarantees that exactly the same point is computed
    // for both line directions, as long as the endpoints are the same.
    if (v1 > 0) {
      // eslint-disable-next-line no-param-reassign
      [i0, i1] = [i1, i0];
      // eslint-disable-next-line no-param-reassign
      [v0, v1] = [v1, v0];
    }
    // After the above swap, i0 will be kept, and i1 will be clipped

    // Check to see if this point has already been computed
    const node = locator.insertUniqueEdge(i0, i1);
    if (node.edgeId !== -1) {
      return node.edgeId;
    }

    // Get the edge and interpolate the new point
    const p0 = points.getPoint(i0);
    const p1 = points.getPoint(i1);

    const f = v0 / (v0 - v1);
    const s = 1.0 - f;
    const t = 1.0 - s;

    const p = [
      s * p0[0] + t * p1[0],
      s * p0[1] + t * p1[1],
      s * p0[2] + t * p1[2],
    ];

    const tol2 = tol * tol;

    // Make sure that new point is far enough from kept point
    if (vtkMath.distance2BetweenPoints(p, p0) < tol2) {
      node.edgeId = i0;
      return i0;
    }

    if (vtkMath.distance2BetweenPoints(p, p1) < tol2) {
      node.edgeId = i1;
      return i1;
    }

    node.edgeId = points.insertNextTuple(p);
    pointData.interpolateData(pointData, i0, i1, node.edgeId, t);

    return node.edgeId;
  }

  /**
   * Method for clipping lines and copying the scalar data.
   *
   * @param {vtkPoints} points
   * @param {vtkDataArray} pointScalars
   * @param {vtvtkDataSetAttributesk} pointData
   * @param {CCSEdgeLocator} edgeLocator
   * @param {vtkCellArray} inputLines
   * @param {vtkCellArray} outputLines
   * @param {vtkDataSetAttributes} inLineData
   * @param {vtkDataSetAttributes} outLineData
   */
  function clipLines(
    points,
    pointScalars,
    pointData,
    edgeLocator,
    inputLines,
    outputLines,
    inLineData,
    outLineData
  ) {
    let numPts;
    let i0;
    let i1;
    let v0;
    let v1;
    let c0;
    let c1;
    const linePts = [];

    const values = inputLines.getData();
    let cellId = 0;
    for (let i = 0; i < values.length; i += numPts + 1, cellId++) {
      numPts = values[i];
      i1 = values[i + 1];
      v1 = pointScalars.getData()[i1];
      c1 = v1 > 0;

      for (let j = 2; j <= numPts; j++) {
        i0 = i1;
        v0 = v1;
        c0 = c1;

        i1 = values[i + j];
        v1 = pointScalars.getData()[i1];
        c1 = v1 > 0;

        // If at least one point wasn't clipped
        if (c0 || c1) {
          // If only one end was clipped, interpolate new point
          if (c0 ? !c1 : c1) {
            linePts[c0 ? 1 : 0] = interpolateEdge(
              points,
              pointData,
              edgeLocator,
              model.tolerance,
              i0,
              i1,
              v0,
              v1
            );
          }

          // If endpoints are different, insert the line segment
          if (i0 !== i1) {
            linePts[0] = i0;
            linePts[1] = i1;
            const newCellId = outputLines.insertNextCell(linePts);
            // outLineData.copyData(inLineData, cellId, newCellId);
            outLineData.passData(inLineData, cellId, newCellId);
          }
        }
      }
    }
  }

  /**
   * Break polylines into individual lines, copying scalar values from
   * inputScalars starting at firstLineScalar.  If inputScalars is zero,
   * then scalars will be set to color.  If scalars is zero, then no
   * scalars will be generated.
   *
   * @param {vtkCellArray} inputLines
   * @param {vtkCellArray} outputLines
   * @param {vtkDataArray} inputScalars
   * @param {Number} firstLineScalar
   * @param {vtkDataArray} scalars
   * @param {Vector3} color
   */
  function breakPolylines(
    inputLines, // 输入的是vtp==>inputLines
    outputLines, // 全是0
    inputScalars, // undefined
    firstLineScalar, // 0
    scalars, // undefined
    color
  ) {
    // console.log('inputScalars', inputScalars, firstLineScalar, scalars);
    const cellColor = [...color];

    let cellId = 0;
    const values = inputLines.getData(); // 获取到线段信息
    let numPts;
    for (let i = 0; i < values.length; i += numPts + 1) {
      numPts = values[i];

      if (inputScalars) {
        inputScalars.getTuple(firstLineScalar + cellId++, cellColor);
      }

      for (let j = 1; j < numPts; j++) {
        outputLines.insertNextCell([values[i + j], values[i + j + 1]]);
        if (scalars) {
          scalars.insertNextTuple(cellColor);
        }
      }
    }
    // console.log('outputLines', outputLines.toJSON());
  }

  /**
   * Copy polygons and their associated scalars to a new array.
   * If inputScalars is set to zero, set polyScalars to color instead.
   * If polyScalars is set to zero, don't generate scalars.
   *
   * @param {vtkCellArray} inputPolys
   * @param {vtkCellArray} outputPolys
   * @param {vtkDataArray} inputScalars
   * @param {Number} firstPolyScalar
   * @param {vtkDataArray} polyScalars
   * @param {Vector3} color
   */
  function copyPolygons(
    inputPolys,
    outputPolys,
    inputScalars,
    firstPolyScalar,
    polyScalars,
    color
  ) {
    if (!inputPolys) {
      return;
    }

    outputPolys.deepCopy(inputPolys);

    if (polyScalars) {
      const scalarValue = [...color];
      const n = outputPolys.getNumberOfCells();
      polyScalars.insertTuple(n - 1, scalarValue);

      if (inputScalars) {
        for (let i = 0; i < n; i++) {
          inputScalars.getTuple(i + firstPolyScalar, scalarValue);
          polyScalars.setTuple(i, scalarValue);
        }
      } else {
        for (let i = 0; i < n; i++) {
          polyScalars.setTuple(i, scalarValue);
        }
      }
      // 根据BaseColor进行颜色的设置，我写死BaseColor为[0,0,0]==>全部设置为0 也就是灰色
      console.log('copyPolygons-polyscalars', polyScalars.toJSON());
    }
  }

  function breakTriangleStrips(
    inputStrips,
    polys,
    inputScalars,
    firstStripScalar,
    polyScalars,
    color
  ) {
    if (inputStrips.getNumberOfCells() === 0) {
      return;
    }

    const values = inputStrips.getData();
    let cellId = firstStripScalar;
    let numPts;
    for (let i = 0; i < values.length; i += numPts + 1, cellId++) {
      numPts = values[i];
      // vtkTriangleStrip.decomposeStrip(numPts, values, polys);
      let p1 = values[i + 1];
      let p2 = values[i + 2];

      for (let j = 0; j < numPts - 2; j++) {
        const p3 = values[i + j + 3];
        if (j % 2) {
          polys.insertNextCell([p2, p1, p3]);
        } else {
          polys.insertNextCell([p1, p2, p3]);
        }
        p1 = p2;
        p2 = p3;
      }

      if (polyScalars) {
        const scalarValue = [...color];

        if (inputScalars) {
          // If there are input scalars, use them instead of "color"
          inputScalars.getTuple(cellId, scalarValue);
        }

        const n = numPts - 3;
        const m = polyScalars.getNumberOfTuples();
        if (n >= 0) {
          // First insert is just to allocate space
          polyScalars.insertTuple(m + n, scalarValue);

          for (let k = 0; k < n; k++) {
            polyScalars.setTuple(m + k, scalarValue);
          }
        }
      }
    }
  }

  /**
   * Given some closed contour lines, create a triangle mesh that
   * fills those lines.  The input lines must be single-segment lines,
   * not polylines.  The input lines do not have to be in order.
   * Only lines from firstLine to will be used.  Specify the normal
   * of the clip plane, which will be opposite the normals
   * of the polys that will be produced.  If outCD has scalars, then color
   * scalars will be added for each poly that is created.
   *
   * @param {vtkPolyData} polyData
   * @param {Number} firstLine
   * @param {Number} numLines
   * @param {vtkCellArray} outputPolys
   * @param {Vector3} normal
   */
  function triangulateContours(
    polyData,
    firstLine,
    numLines,
    outputPolys,
    normal
  ) {
    // If no cut lines were generated, there's nothing to do
    if (numLines <= 0) {
      return;
    }

    const triangulationError = !vtkContourTriangulator.triangulateContours(
      polyData,
      firstLine,
      numLines,
      outputPolys,
      [-normal[0], -normal[1], -normal[2]]
    );

    if (triangulationError && model.triangulationErrorDisplay) {
      vtkErrorMacro('Triangulation failed, polyData may not be watertight.');
    }
  }

  /**
   * Break polylines into individual lines, copying scalar values from
   * inputScalars starting at firstLineScalar. If inputScalars is zero,
   * then scalars will be set to color. If scalars is zero, then no
   * scalars will be generated.
   *
   * @param {Number[]} polygon
   * @param {vtkPoints} points
   * @param {vtkCellArray} triangles
   * @returns {Boolean}
   */
  function triangulatePolygon(polygon, points, triangles) {
    return vtkContourTriangulator.triangulatePolygon(
      polygon,
      points,
      triangles
    );
  }

  /**
   * Clip and contour polys in one step, in order to guarantee
   * that the contour lines exactly match the new free edges of
   * the clipped polygons.  This exact correspondence is necessary
   * in order to guarantee that the surface remains closed.
   *
   * @param {vtkPoints} points
   * @param {vtkDataArray} pointScalars
   * @param {vtkDataSetAttributes} pointData
   * @param {CCSEdgeLocator} edgeLocator
   * @param {Number} triangulate
   * @param {vtkCellArray} inputPolys
   * @param {vtkCellArray} outputPolys
   * @param {vtkCellArray} outputLines
   * @param {vtkDataSetAttributes} inCellData
   * @param {vtkDataSetAttributes} outPolyData
   * @param {vtkDataSetAttributes} outLineData
   */
  function clipAndContourPolys(
    points,
    pointScalars,
    pointData,
    edgeLocator,
    triangulate,
    inputPolys,
    outputPolys,
    outputLines,
    inCellData,
    outPolyData,
    outLineData
  ) {
    const idList = model._idList;
    // How many sides for output polygons?
    let polyMax = Number.MAX_VALUE;
    if (triangulate) {
      if (triangulate < 4) {
        // triangles only
        polyMax = 3;
      } else if (triangulate === 4) {
        // allow triangles and quads
        polyMax = 4;
      }
    }

    // eslint-disable-next-line prefer-const
    let triangulationFailure = false;

    // Go through all cells and clip them
    const values = inputPolys.getData();
    const linePts = [];
    let cellId = 0;
    let numPts;
    for (let i = 0; i < values.length; i += numPts + 1, cellId++) {
      numPts = values[i];

      let i1 = values[i + numPts];
      let v1 = pointScalars.getData()[i1];
      let c1 = v1 > 0;

      // The ids for the current edge: init j0 to -1 if i1 will be clipped
      let j0 = c1 ? i1 : -1;
      let j1 = 0;

      // To store the ids of the contour line
      linePts[0] = 0;
      linePts[1] = 0;

      let idListIdx = 0;
      for (let j = 1; j <= numPts; j++) {
        // Save previous point info
        const i0 = i1;
        const v0 = v1;
        const c0 = c1;

        // Generate new point info
        i1 = values[i + j];
        v1 = pointScalars.getData()[i1];
        c1 = v1 > 0;

        // If at least one edge end point wasn't clipped
        if (c0 || c1) {
          // If only one end was clipped, interpolate new point
          if (c0 ? !c1 : c1) {
            j1 = interpolateEdge(
              points,
              pointData,
              edgeLocator,
              model.tolerance,
              i0,
              i1,
              v0,
              v1
            );

            if (j1 !== j0) {
              idList[idListIdx++] = j1;
              j0 = j1;
            }

            // Save as one end of the contour line
            linePts[c0 ? 1 : 0] = j1;
          }

          if (c1) {
            j1 = i1;

            if (j1 !== j0) {
              idList[idListIdx++] = j1;
              j0 = j1;
            }
          }
        }
      }

      // Insert the clipped poly
      const numPoints = idListIdx;
      idList.length = numPoints;

      if (model.triangulatePolys && numPoints > polyMax) {
        // TODO: Support triangulatePolygon
        let newCellId = outputPolys.getNumberOfCells();
        // Triangulate the poly and insert triangles into output.
        const success = triangulatePolygon(idList, points, outputPolys);
        if (!success) {
          triangulationFailure = true;
        }

        // Copy the attribute data to the triangle cells
        const ncells = outputPolys.getNumberOfCells();
        for (; newCellId < ncells; newCellId++) {
          outPolyData.passData(inCellData, cellId, newCellId);
        }
      } else if (numPoints > 2) {
        // Insert the polygon without triangulating it
        const newCellId = outputPolys.insertNextCell(idList);
        outPolyData.passData(inCellData, cellId, newCellId);
      }

      // Insert the contour line if one was created
      if (linePts[0] !== linePts[1]) {
        const newCellId = outputLines.insertNextCell(linePts);
        outLineData.passData(inCellData, cellId, newCellId);
      }
    }

    if (triangulationFailure && model.triangulationErrorDisplay) {
      vtkErrorMacro('Triangulation failed, output may not be watertight');
    }
  }

  /**
   * Squeeze the points and store them in the output.  Only the points that
   * are used by the cells will be saved, and the pointIds of the cells will
   * be modified.
   *
   * @param {vtkPolyData} output
   * @param {vtkPoints} points
   * @param {vtkDataSetAttributes} pointData
   * @param {String} outputPointDataType
   */
  function squeezeOutputPoints(output, points, pointData, outputPointDataType) {
    console.log(
      'squeezeOutputPoints-output',
      output.toJSON(),
    ); // CellData可以获取到哪些单元是进行变色了的==>知晓哪些单元ID便可知晓单元涉及的顶点，将对应的点标量改成0即可
    // ----- 数据初始化 ------
    const CellLen = output.toJSON().cellData.arrays[0].data.size
    const sumCellArray = output.toJSON().cellData.arrays[0].data.values
    // 用于存储哪些单元是要进行变色的
    const cellIdArray = [];
    for (let i = 0; i < CellLen; i+=3) {
        if(sumCellArray[i] === 255) cellIdArray.push(i / 3);
    }
    console.log('squeezeOutputPoints-cellIdArray', cellIdArray);
    // Create a list of points used by cells
    const n = points.getNumberOfPoints(); // 顶点长度
    let numNewPoints = 0;
    
    const outPointData = output.getPointData(); // 点标量
    const pointMap = []; // 顶点ID 对应 新增加的顶点数量(而这个value值则是当前坐标在被裁剪后的顶点索引)
    pointMap.length = n;

    // Cell对应Poly中的索引位置也就是索引的起点或者说是Cell组成的顶点个数的起点
    const cellToPolyIndex = [];

    const cellArrays = [
      output.getVerts(), // null
      output.getLines(), // null
      output.getPolys(), // 找到被CELL所使用的新增点 == numberOfCells: 41
      output.getStrips(), // null
    ];
    // ----- END ------

    // Find all the newPoints that are used by cells
    cellArrays.forEach((cellArray) => {
      if (!cellArray) {
        return;
      }
      const values = cellArray.getData();
      console.log('squeezeOutputPoints-values', cellArray.toJSON());
      let numPts; // 组成单元
      let pointId;
      for (let i = 0; i < values.length; i += numPts + 1) {
        // 记录单元的组成数
        numPts = values[i];
        cellToPolyIndex.push(i);
        for (let j = 1; j <= numPts; j++) {
          // 在单元组成数的基础上
          pointId = values[i + j];
          if (pointMap[pointId] === undefined) {
            pointMap[pointId] = numNewPoints++;
          }
        }
      }
    });
    // 小疑问，未被填充的PointMap为何会有值
    console.log('squeezeOutputPoints-pointMap', pointMap, numNewPoints, cellToPolyIndex);

    // numNewPoints 这里新增顶点数量是切面的顶点(暂定是)
    // Create exactly the number of points that are required==>作为最终的结果进行输出
    const newPoints = vtkPoints.newInstance({
      size: numNewPoints * 3,
      dataType: outputPointDataType,
    });
    // outPointData.copyAllocate(pointData, numNewPoints, 0);

    console.log('squeezeOutputPoints-pointData', pointData.toJSON());
    const p = [];
    let newPointId; // 将新增顶点插入到newPointId中
    // pointId是原始的顶点坐标  newPointId 是处理后的顶点坐标
    for (let pointId = 0; pointId < n; pointId++) {
      // n是所有的顶点编号==>顶点Map中寻找对应点ID==>所有点==>则去创造额外的
      newPointId = pointMap[pointId];
      if (newPointId !== undefined) {
        // 获取每顶点的坐标由ponit进行存储(覆盖掉之前的存储信息)
        points.getPoint(pointId, p);
        // 然后插入到newPoints中
        newPoints.setTuple(newPointId, p);
        // other: vtkFieldData, fromId?: number, toId?: number
        outPointData.passData(pointData, pointId, newPointId);
        // 将原始顶点编号对应处理后的顶点进行标量对应设置
        // outPointData.copyData(pointData, pointId, newPointId);
      }
    }

    console.log('squeezeOutputPoints-outPointData', outPointData.toJSON());
    console.log('squeezeOutputPoints-newPoints', newPoints.toJSON());

    // Change the cell pointIds to reflect the new point array==>重新映射
    cellArrays.forEach((cellArray) => {
      if (!cellArray) {
        return;
      }
      const values = cellArray.getData();
      console.log('squeezeOutputPoints-values', values);
      let numPts;
      let pointId;
      for (let i = 0; i < values.length; i += numPts + 1) {
        numPts = values[i];
        for (let j = 1; j <= numPts; j++) {
          pointId = values[i + j];
          values[i + j] = pointMap[pointId];
        }
      }
      console.log('after-squeezeOutputPoints-values', cellArray.toJSON());
    });

    /** cellToPolyIndex Cell对应Poly中的索引位置也就是索引的起点或者说是Cell组成的顶点个数的起点
     *cellIdArray 用于存储哪些单元是要进行变色的
     *方案1:筛选出对应的切面顶点并对其进行重新赋值PointData 
     *方案2:能否将这些顶点给去除掉?===>就算去除掉 还是不可以，因为模型的Poly仍是网格的数值 */ 
    const CellIndexLen = cellIdArray.length // 变色的Cell长度
    const pointDataScalars = outPointData.getScalars().getData();
    for(let i = 0;i<CellIndexLen;i++){
      const index = cellToPolyIndex[cellIdArray[i]]; // 拿到Cell对应Poly的索引
      const len = output.getPolys().toJSON().values[index] // Cell 组成长度
      for(let j = 1 ;j<=len;j++){
        const PointsIndex = output.getPolys().toJSON().values[index + j] // 获取到顶点编号
        pointDataScalars[PointsIndex] = NaN;
        // outPointData.setTuple(PointsIndex, 0);
        // console.log('squeezeOutputPoints-output', PointsIndex,output)
      }
    }
    // console.log('squeezeOutputPoints-outPointData', outPointData.getScalars().getData())
    // console.log('squeezeOutputPoints-output', output.toJSON())
    output.setPoints(newPoints);
  }
  // 数据的输入
  publicAPI.requestData = (inData, outData) => {
    // implement requestData
    console.log('inData', inData[0].toJSON());
    const input = inData[0];
    // 重新输出一个Polydata
    const output = vtkPolyData.newInstance();
    outData[0] = output;

    if (!input) {
      vtkErrorMacro('Invalid or missing input');
      return;
    }

    if (model._idList == null) {
      model._idList = [];
    } else {
      model._idList.length = 0;
    }

    // Get the input points===>获取输入点的相关值及函数方法
    const inputPoints = input.getPoints();
    let numPts = 0;
    let inputPointsType = VtkDataTypes.FLOAT;
    if (inputPoints) {
      numPts = inputPoints.getNumberOfPoints(); // 6649 顶点数
      inputPointsType = inputPoints.getDataType();
    }
    // Force points to double precision, copy the point attributes ==>仿照input新开辟一个新的变量范围==>是input中模型的坐标
    const points = vtkPoints.newInstance({
      size: numPts * 3,
      dataType: VtkDataTypes.DOUBLE,
    });

    const pointData = vtkDataSetAttributes.newInstance();
    let inPointData = null;
    // 如果开启了passPointData则会获取到模型的标量属性
    if (model.passPointData) {
      // 获取到标量数据
      inPointData = input.getPointData();
      // pointData.interpolateAllocate(inPointData, numPts, 0);
    }

    const point = [];
    // ptId顶点
    for (let ptId = 0; ptId < numPts; ptId++) {
      // 获取每顶点的坐标由ponit进行存储(覆盖掉之前的存储信息)
      inputPoints.getPoint(ptId, point); // Get the coordinate of a point.
      // 然后插入到points中
      points.setTuple(ptId, point);
      if (inPointData) {
        // 能够给每个顶点设置FieldData=>复制备份
        // pointData.copyData(inPointData, ptId, ptId);
        pointData.passData(inPointData, ptId, ptId);
      }
    }

    // An edge locator to avoid point duplication while clipping
    const edgeLocator = new CCSEdgeLocator();

    // A temporary polydata for the contour lines that are triangulated
    const tmpContourData = vtkPolyData.newInstance();

    // The cell scalars==>设置单元格标量
    let lineScalars;
    let polyScalars;
    let inputScalars;

    // For input scalars: the offsets to the various cell types
    let firstLineScalar = 0;
    let firstPolyScalar = 0;
    let firstStripScalar = 0;

    // Make the colors to be used on the data
    let numberOfScalarComponents = 1;
    const colors = [
      [0, 0, 0], // baseColor
      [0, 0, 0], // clipColor
      [0, 0, 0], // activePlaneColor
    ];

    // 根据渲染模式进行选择==>仅仅设置切面的颜色
    // if (model.scalarMode === ScalarMode.COLORS) {
    //   numberOfScalarComponents = 3;
    //   createColorValues(
    //     model.baseColor,
    //     model.clipColor,
    //     model.activePlaneColor,
    //     colors
    //   );
    // } else if (model.scalarMode === ScalarMode.LABELS) {
    //   colors[0][0] = 0;
    //   colors[1][0] = 1;
    //   colors[2][0] = 2;
    // }

    // 硬传值进行颜色的设置==>BaseColor 黑色,
    numberOfScalarComponents = 3;
    createColorValues([0, 0, 0], [1, 0, 0], [0, 0, 0], colors);

    // This is set if we have to work with scalars. The input scalars
    // will be copied if they are unsigned char with 3 components, otherwise
    // new scalars will be generated.
    const numVerts = input.getVerts()?.getNumberOfCells() || 0;
    // 获取到线段信息
    const inputLines = input.getLines();
    const numLines = inputLines?.getNumberOfCells() || 0;
    // console.log('numLines', inputLines.toJSON(), numLines);
    const inputPolys = input.getPolys();
    const numPolys = inputPolys?.getNumberOfCells() || 0;
    const numStrips = input.getStrips()?.getNumberOfCells() || 0;

    // 设置线标量==>存在才会设置Poly标量==>个人感觉不影响，因为当设置上PassPointData后仍会渲染上颜色
    // ----------------- 修改判断条件 model.scalarMode !== ScalarMode.NONE -----------------
    if (model.scalarMode) {
      // 设置线标量
      lineScalars = vtkDataArray.newInstance({
        dataType: VtkDataTypes.UNSIGNED_CHAR,
        empty: true,
        // size: 0,
        // values: new Uint8Array(numLines * 3),
        numberOfComponents: numberOfScalarComponents,
      });
      // 获得线段标量
      const tryInputScalars = input.getCellData().getScalars();
      // Get input scalars if they are RGB color scalars
      if (
        tryInputScalars &&
        tryInputScalars.getDataType() === VtkDataTypes.UNSIGNED_CHAR &&
        numberOfScalarComponents === 3 &&
        tryInputScalars.getNumberOfComponents() === 3
      ) {
        inputScalars = input.getCellData().getScalars();
        firstLineScalar = numVerts;
        firstPolyScalar = numVerts + numLines;
        firstStripScalar = numVerts + numLines + numPolys;
      }
    }
    // ----------------- END -----------------
    // Break the input lines into segments, generate scalars for lines
    let lines;
    if (numLines > 0) {
      // 重新设置Lines作为输出
      lines = vtkCellArray.newInstance({
        dataType: inputLines.getDataType(),
        values: new Uint8Array(numLines * 3), // we will have at least that amount of lines
        size: 0,
      });
      breakPolylines(
        inputLines,
        lines, // outputLines
        inputScalars,
        firstLineScalar,
        lineScalars,
        colors[0]
      );
    } else {
      lines = vtkCellArray.newInstance({
        empty: true,
      });
    }
    // 将线进行破坏==>经过处理得到的lines属性
    // console.log('lines', lines.toJSON());

    let polys = null;
    let polyMax = 3;
    if (numPolys > 0 || numStrips > 0) {
      // If there are line scalars, then poly scalars are needed too  如果渲染颜色为零则会插入空白的Polyscalars
      if (lineScalars) {
        polyScalars = vtkDataArray.newInstance({
          dataType: VtkDataTypes.UNSIGNED_CHAR,
          empty: true,
          // size: 0,
          // values: new Uint8Array(inputPolys.getNumberOfCells(false) * 3),
          numberOfComponents: numberOfScalarComponents,
        });
        console.log('polyScalars', polyScalars.toJSON());
      }
      // 输出poly==>复制一份新的，如果ScalarMode设置的是None则会设置上PolyScalars
      polys = vtkCellArray.newInstance();
      copyPolygons(
        inputPolys,
        polys, // ==>复制一份inputPolys 到ploys中 outputPolys
        inputScalars,
        firstPolyScalar,
        polyScalars,
        colors[0] // baseColor
      );
      // TODO: Support triangle strips
      breakTriangleStrips(
        input.getStrips(),
        polys,
        inputScalars,
        firstStripScalar,
        polyScalars,
        colors[0]
      );
      // Check if the input has polys and quads or just triangles
      polyMax = inputPolys.getCellSizes().reduce((a, b) => (a > b ? a : b), 0);
    }

    // Arrays for storing the clipped lines and polys
    let newLines = vtkCellArray.newInstance({
      dataType: lines.getDataType(),
      empty: true,
    });
    let newPolys = null;
    if (polys) {
      // value为空状态
      newPolys = vtkCellArray.newInstance({
        dataType: polys.getDataType(),
        empty: true,
      });
    }
    // The line scalars, for coloring the outline
    let inLineData = vtkDataSetAttributes.newInstance();
    inLineData.copyScalarsOn();
    inLineData.setScalars(lineScalars);

    // The poly scalars, for coloring the faces ==>设置上标量
    let inPolyData = vtkDataSetAttributes.newInstance();
    inPolyData.copyScalarsOn();
    inPolyData.setScalars(polyScalars);

    // Also create output attribute data
    let outLineData = vtkDataSetAttributes.newInstance();
    outLineData.copyScalarsOn();

    let outPolyData = vtkDataSetAttributes.newInstance();
    outPolyData.copyScalarsOn();

    const planes = model.clippingPlanes;

    // Go through the clipping planes and clip the input with each plane==>遍历planes数组里面每一个切面隐函数
    for (let planeId = 0; planeId < planes.length; planeId++) {
      const plane = planes[planeId];

      let triangulate = 5;
      // 判断是否是最后一个切面
      if (planeId === planes.length - 1) {
        triangulate = polyMax;
      }
      // 当前切面编号是否与活动面编号匹配
      const active = planeId === model.activePlaneId;

      // Convert the plane into an easy-to-evaluate function
      const pc = plane.getNormal();
      // OK to modify pc because vtkPlane.getNormal() returns a copy==>计算出点在截面的里面还是外面==>通过计算出来的值的正负来判断
      pc[3] = -vtkMath.dot(pc, plane.getOrigin());

      // Create the clip scalars by evaluating the plane at each point==>获取到模型的顶点个数
      const numPoints = points.getNumberOfPoints();
      console.log('numPoints', numPoints);
      // The point scalars, needed for clipping (not for the output!)
      const pointScalars = vtkDataArray.newInstance({
        dataType: VtkDataTypes.DOUBLE,
        size: numPoints,
      });
      // 设置标量信息
      const pointScalarsData = pointScalars.getData();
      const pointsData = points.getData();
      let i = 0;
      for (let pointId = 0; pointId < numPoints; pointId) {
        pointScalarsData[pointId++] =
          pointsData[i++] * pc[0] +
          pointsData[i++] * pc[1] +
          pointsData[i++] * pc[2] +
          pc[3];
      }
      console.log('after-Plane-pointScalarsData', pointScalars.toJSON());
      // Prepare the output scalars
      // outLineData.copyAllocate(inLineData, 0, 0);
      // outPolyData.copyAllocate(inPolyData, 0, 0);

      // Reset the locator
      edgeLocator.initialize();

      // Clip the lines
      clipLines(
        points,
        pointScalars,
        pointData, // 获取到之前VTP的标量数据
        edgeLocator,
        lines, // inputLines
        newLines, // outLines
        inLineData, // inputLinesData
        outLineData // outLinesData
      );

      // Clip the polys
      if (polys) {
        // Get the number of lines remaining after the clipping
        const numClipLines = newLines.getNumberOfCells();
        // Cut the polys to generate more lines
        clipAndContourPolys(
          points,
          pointScalars,
          pointData,
          edgeLocator,
          triangulate,
          polys, // inputPolys
          newPolys, // outputPolys
          newLines, // outputLines
          inPolyData, // inCellData
          outPolyData,
          outLineData
        );
        console.log('Plane-clipLines-Polys', outPolyData.toJSON());
        // Add scalars for the newly-created contour lines
        let scalars = outLineData.getScalars();
        // 处理Line
        if (scalars) {
          // Set the color to the active color if plane is active ==> 查看planeId是否与activePlaneId对应 不对应则都渲染从成切面颜色
          // const color = colors[1 + (active ? 1 : 0)];
          const color = [255, 0, 0];
          const activeColor = colors[2];
          const numNewLines = newLines.getNumberOfCells();

          const oldColor = [];
          for (let lineId = numClipLines; lineId < numNewLines; lineId++) {
            scalars.getTuple(lineId, oldColor);
            if (
              numberOfScalarComponents !== 3 ||
              oldColor[0] !== activeColor[0] ||
              oldColor[1] !== activeColor[1] ||
              oldColor[2] !== activeColor[2]
            ) {
              scalars.setTuple(lineId, color);
            }
          }
        }

        //* * Generate new polys from the cut lines 33**
        let cellId = newPolys.getNumberOfCells();
        const numClipAndContourLines = newLines.getNumberOfCells();

        // Create a polydata for the lines
        tmpContourData.setPoints(points);
        tmpContourData.setLines(newLines);
        tmpContourData.buildCells();

        // 三角化之后会Poly整体上升
        triangulateContours(
          tmpContourData,
          numClipLines,
          numClipAndContourLines - numClipLines,
          newPolys, // outputPoly
          pc
        );
        console.log('clip-newPolys', newPolys.toJSON());
        // Add scalars for the newly-created polys ==>这里所创造出的新面就是切面
        scalars = outPolyData.getScalars();
        console.log('Plane-outPolyData.getScalars()', scalars.toJSON());
        // 处理Poly
        if (scalars) {
          // 存在疑问 为什么Size与value的数值不匹配
          // const color = colors[1 + (active ? 1 : 0)];
          // 改变了切面的颜色===>numCells 及cellID是存储切掉的新Poly的
          const color = [255, 0, 255];
          const numCells = newPolys.getNumberOfCells(); // 获取到最新的Polys 的数量
          console.log('Plane-numCells', numCells, 'cellId', cellId);
          if (numCells > cellId) {
            // The insert allocates space up to numCells - 1==>在给定索引处插入给定元组
            scalars.insertTuple(numCells - 1, color); // SIZE 扩充numCells - 1的空间(重新设置)
            for (; cellId < numCells; cellId++) {
              // 设置从给定索引开始的给定元组
              scalars.setTuple(cellId, color); // 若cellId === 28 =>28*3 = 84 从数组84索引开始插入颜色标量==>插入到Celldata中
            }
          }
          console.log(
            'Plane-deal-outPolyData.getScalars()',
            outPolyData.getScalars().toJSON()
          );
        }


        // Add scalars to any diagnostic lines that added by
        // triangulateContours(). In usual operation, no lines are added.
        scalars = outLineData.getScalars();
        if (scalars) {
          const color = [0, 255, 255];
          const numCells = newLines.getNumberOfCells();
          if (numCells > numClipAndContourLines) {
            // The insert allocates space up to numCells - 1
            scalars.insertTuple(numCells - 1, color);
            for (
              let lineCellId = numClipAndContourLines;
              lineCellId < numCells;
              lineCellId++
            ) {
              scalars.setTuple(lineCellId, color);
            }
          }
        }
      }
      console.log('swap-before-poly-newpoly.', [
        newPolys.toJSON(),
        polys.toJSON(),
        outPolyData.toJSON(),
        inPolyData.toJSON(),
      ]);
      // Swap the lines, points, etcetera: old output becomes new input
      [lines, newLines] = [newLines, lines];
      newLines.initialize();

      if (polys) {
        // 将数据进行交换，之前的polys是旧输出，将newPolys替换polys(现在polys的值是newPolys)
        [polys, newPolys] = [newPolys, polys];
        newPolys.initialize();
      }
      // console.log('swap-after-poly-newpoly.', [
      //   newPolys.toJSON(),
      //   polys.toJSON(),
      // ]);
      [inLineData, outLineData] = [outLineData, inLineData];
      outLineData.initialize();

      [inPolyData, outPolyData] = [outPolyData, inPolyData];
      outPolyData.initialize();
      // console.log('swap-after-PolyData-PolyData', [
      //   outPolyData.toJSON(),
      //   inPolyData.toJSON(),
      // ]);
    }

    // Get the line scalars
    const scalars = inLineData.getScalars();
    // console.log('generateOutline', model.generateOutline); // false没有设置Lines
    if (model.generateOutline) {
      output.setLines(lines);
    } else if (scalars) {
      scalars.initialize();
    }

    // console.log('model.generateFaces', model.generateFaces); // true
    if (model.generateFaces) {
      // Arrays for storing the clipped polys
      output.setPolys(polys); // 设置Poly结构
      if (polys && scalars) {
        const pScalars = inPolyData.getScalars();
        const m = scalars.getNumberOfTuples();
        const n = pScalars.getNumberOfTuples();

        if (n > 0) {
          const color = [0, 0, 0];

          // This is just to expand the array
          scalars.insertTuple(n + m - 1, color);

          // Fill in the poly scalars
          for (let i = 0; i < n; i++) {
            pScalars.getTuple(i, color);
            scalars.setTuple(i + m, color);
          }
        }
      }
    }

    if (scalars && model.scalarMode === ScalarMode.COLORS) {
      scalars.setName('Colors');
      output.getCellData().setScalars(scalars);
    } else if (model.scalarMode === ScalarMode.LABELS) {
      // Don't use VTK_UNSIGNED_CHAR or they will look like color scalars
      // const categories = vtkSignedCharArray.newInstance();
      // categories.deepCopy(scalars);
      // categories.setName("Labels");
      // output.getCellData().setScalars(categories);
      // categories.delete();
      // TODO: Check
      const categories = scalars.newClone();
      categories.setData(scalars.getData().slice());
      categories.setName('Labels');
      output.getCellData().setScalars(categories);
    } else {
      output.getCellData().setScalars(null);
    }

    // Finally, store the points in the output
    // 这里的output是存在CellData作为标量颜色继续处理 / points已经是筛选过剩下的模型点/
    // 需要知道输入裁剪了哪些点==>或者说outpoutCellData中哪些颜色是渲染[255,0,255]
    squeezeOutputPoints(output, points, pointData, inputPointsType);
    // TODO: Check
    // output.squeeze();
    console.log('output', output.toJSON()); // 如果是ScalarMode.COLORS 不开启pointData情况下，正常设置颜色==>将颜色设置到 cellData中
    outData[0] = output;
  };

  Object.keys(ScalarMode).forEach((key) => {
    const name = capitalize(key.toLowerCase());
    publicAPI[`setScalarModeTo${name}`] = () => {
      model.scalarMode = ScalarMode[key];
    };
  });
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  clippingPlanes: null,
  tolerance: 1e-6,
  passPointData: false,
  triangulatePolys: false,

  scalarMode: ScalarMode.NONE,
  generateOutline: false,
  generateFaces: true,
  activePlaneId: -1,

  baseColor: null,
  clipColor: null,
  activePlaneColor: null,

  triangulationErrorDisplay: false,
  // _idList: null,
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  // Make this a VTK object
  macro.obj(publicAPI, model);

  // Also make it an algorithm with one input and one output
  macro.algo(publicAPI, model, 1, 1);

  macro.setGet(publicAPI, model, [
    'clippingPlanes',
    'tolerance',
    'passPointData',
    'triangulatePolys',
    'scalarMode',
    'generateOutline',
    'generateFaces',
    'activePlaneId',
    'triangulationErrorDisplay',
  ]);

  macro.setGetArray(
    publicAPI,
    model,
    ['baseColor', 'clipColor', 'activePlaneColor'],
    3
  );

  // Object specific methods
  vtkClipClosedSurface(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, 'vtkClipClosedSurface');

// ----------------------------------------------------------------------------

export default { newInstance, extend, ...Constants };
