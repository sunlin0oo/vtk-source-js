/* eslint-disable no-unused-vars */
import 'vtk.js/Sources/favicon';

// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import 'vtk.js/Sources/Rendering/Profiles/Geometry';
import 'vtk.js/Sources/Rendering/Profiles/Glyph';

import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkSphereSource from 'vtk.js/Sources/Filters/Sources/SphereSource';
import vtkFullScreenRenderWindow from 'vtk.js/Sources/Rendering/Misc/FullScreenRenderWindow';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPolyData from 'vtk.js/Sources/Common/DataModel/PolyData';
import vtkGlyph3DMapper from 'vtk.js/Sources/Rendering/Core/Glyph3DMapper';
import {
  ColorMode,
  ScalarMode,
} from 'vtk.js/Sources/Rendering/Core/Mapper/Constants';

import { OrientationModes } from 'vtk.js/Sources/Rendering/Core/Glyph3DMapper/Constants';
import jsondata from '../../../Data/JSON/beam_vtp.json';

import controlPanel from './controller.html';

// ----------------------------------------------------------------------------
// Standard rendering code setup
// ----------------------------------------------------------------------------

const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
  background: [0, 0, 0],
});
const renderer = fullScreenRenderer.getRenderer();
const renderWindow = fullScreenRenderer.getRenderWindow();
// ----------------------------------------------------------------------------
// Add field to help in understanding the orientation
// ----------------------------------------------------------------------------

function addBeachBallColor(ds) {
  const xyz = ds.getPoints().getData();
  const rgb = new Uint8Array(xyz.length);
  console.log('xyz', xyz);
  rgb.fill(0);
  for (let i = 0; i < xyz.length; i += 3) {
    const colorIdx =
      Math.sign(xyz[i]) * Math.sign(xyz[i + 1]) > 0
        ? 0 // red
        : 2; // blue
    rgb[i + colorIdx] = 128;
    if (xyz[i + 2] > 0) {
      // +Z add some light
      rgb[i + 0] += 128;
      rgb[i + 1] += 64;
      rgb[i + 2] += 64;
    }
    if (xyz[i + 1] > 0) {
      // +Y add some light
      rgb[i + 0] += 64;
      rgb[i + 1] += 64;
      rgb[i + 2] += 64;
    }
  }

  ds.getPointData().setScalars(
    vtkDataArray.newInstance({
      name: 'color',
      numberOfComponents: 3,
      values: rgb,
    })
  );

  return ds;
}

function ReadJson(data) {
  const len = data.edgelist.length;
  const numdimesion = len * 6;
  // 存储顶点维度
  const pointValues = new Float32Array(numdimesion);
  // 记录当前顶点维度的位置
  let pointValuesIndex = 0;
  // // 存储法向量
  // const normalValues = new Float32Array(len);
  // 存储Cell
  const cellValues = new Uint32Array(len * 3);
  // 单元偏量
  let cellOffset = 0;
  // 创建polydata数据集合
  const polydata = vtkPolyData.newInstance();
  // 读取数据
  for (let edgeIdx = 0; edgeIdx < len; edgeIdx++) {
    // 把所有的线段顶点放到pointValues进行存储
    for (let i = 0; i < 6; i++) {
      pointValues[pointValuesIndex] = data.edgelist[edgeIdx].vertex_coord[i];
      pointValuesIndex++;
    }
    // 2表示一个单元包含的点的个数是2，cellOffset:表示单元所关联的点的Id
    cellValues[cellOffset++] = 2;
    cellValues[cellOffset++] = edgeIdx * 2 + 0;
    cellValues[cellOffset++] = edgeIdx * 2 + 1;
  }
  // console.log('pointValues', pointValues);
  // console.log('cellValues', cellValues);

  // polydata.getCellData().setNormals(vtkDataArray.newInstance({
  //   name: 'Normals',
  //   values: normalValues,
  //   numberOfComponents: 3
  // })); // Add new output

  polydata.getPoints().setData(pointValues, 3);
  // 将Cell输入导入到CellArray中作为拓扑结构
  // polydata.getPolys().setData(cellValues);
  polydata.getLines().setData(cellValues);
  // polydata.getVerts().setData(cellValues);
  // console.log('polydata.getPoints()', polydata.getPoints().get()); // 获取顶点相关信息
  // console.log('polydata.getPolys()', polydata.getPolys().get()); // 获取拓扑结构的数值
  return polydata;
}

// ----------------------------------------------------------------------------
// Glyph definition
// ----------------------------------------------------------------------------

// const sphereSource = vtkSphereSource.newInstance({
//   height: 1.0,
//   phiResolution: 360,
//   thetaResolution: 360,
// });
// const sphereDataset = addBeachBallColor(sphereSource.getOutputData());
const polydata = ReadJson(jsondata);
const sphereDataset = addBeachBallColor(polydata);

// ----------------------------------------------------------------------------
// Grid on which to map the glyph
// x: 3, y: 2, z: 1
// ----------------------------------------------------------------------------

const baseGrid = vtkPolyData.newInstance();
// prettier-ignore
baseGrid.getPoints().setData(Float32Array.from([
  0, 0, 0,
]), 3);

const anglesArray = new Float32Array(5 * 3);
const anglesDataArray = vtkDataArray.newInstance({
  name: 'angles',
  values: anglesArray,
  numberOfComponents: 3,
});
baseGrid.getPointData().addArray(anglesDataArray);

// ----------------------------------------------------------------------------
// Rendering setup
// ----------------------------------------------------------------------------

const mapper = vtkGlyph3DMapper.newInstance({
  colorByArrayName: 'color',
  colorMode: ColorMode.DIRECT_SCALARS,
  scalarMode: ScalarMode.USE_POINT_FIELD_DATA,
  scalarVisibility: true,
  // Glyph handling
  orient: true,
  orientationMode: OrientationModes.ROTATION,
  orientationArray: 'angles',
});
mapper.setInputData(baseGrid, 0);
mapper.setInputData(sphereDataset, 1); // Glyph

const actor = vtkActor.newInstance();
actor.setMapper(mapper);

renderer.addActor(actor);
renderer.resetCamera();
renderWindow.render();

// -----------------------------------------------------------
// UI control handling
// -----------------------------------------------------------

fullScreenRenderer.addController(controlPanel);

function updateAngles() {
  const x = Number(document.querySelector('.xAngle').value);
  const y = Number(document.querySelector('.yAngle').value);
  const z = Number(document.querySelector('.zAngle').value);
  for (let i = 0; i < anglesArray.length; i += 3) {
    anglesArray[i] = (Math.PI * x) / 180;
    anglesArray[i + 1] = (Math.PI * y) / 180;
    anglesArray[i + 2] = (Math.PI * z) / 180;
  }
  anglesDataArray.modified();
  baseGrid.modified(); // Should not be needed
  renderWindow.render();
  document.querySelector('.txt').innerHTML = `X(${x}), Y(${y}), Z(${z})`;
}

document.querySelectorAll('.angle').forEach((elem) => {
  elem.addEventListener('input', updateAngles);
});

updateAngles();
