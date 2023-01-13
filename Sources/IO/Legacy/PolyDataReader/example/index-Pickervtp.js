/* eslint-disable import/no-unresolved */
/* eslint-disable array-callback-return */
/* eslint-disable no-restricted-syntax */
/* eslint-disable prettier/prettier */
/* eslint-disable no-irregular-whitespace */
/* eslint-disable no-unused-vars */
import 'vtk.js/Sources/favicon';

// Load the rendering pieces we want to use (for both WebGL and WebGPU
import 'vtk.js/Sources/Rendering/Profiles/Geometry';
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkFullScreenRenderWindow from 'vtk.js/Sources/Rendering/Misc/FullScreenRenderWindow';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import vtkXMLPolyDataReader from 'vtk.js/Sources/IO/XML/XMLPolyDataReader';
import HttpDataAccessHelper from 'vtk.js/Sources/IO/Core/DataAccessHelper/HttpDataAccessHelper';
import vtkSphereSource from 'vtk.js/Sources/Filters/Sources/SphereSource';
import vtkPointPicker from 'vtk.js/Sources/Rendering/Core/PointPicker';
import vtkCellPicker from 'vtk.js/Sources/Rendering/Core/CellPicker';
import vtkCalculator from 'vtk.js/Sources/Filters/General/Calculator';
import { AttributeTypes } from 'vtk.js/Sources/Common/DataModel/DataSetAttributes/Constants';
import { FieldDataTypes } from 'vtk.js/Sources/Common/DataModel/DataSet/Constants';
// 引入颜色模式，标量模式
import {
  ColorMode,
  ScalarMode
} from 'vtk.js/Sources//Rendering/Core/Mapper/Constants';

HttpDataAccessHelper.fetchBinary(
  `${__BASE_PATH__}/data/model/box.vtp`
).then((binary) => {
  // ----------------Rendering----------------
  const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance();
  const renderer = fullScreenRenderer.getRenderer();
  const renderWindow = fullScreenRenderer.getRenderWindow();

  const resetCamera = renderer.resetCamera;
  const render = renderWindow.render;
  // ----------------End----------------

  // ----------------------------------------------------------------------------
  // Add a cube source
  // ----------------------------------------------------------------------------
  const vtpReader = vtkXMLPolyDataReader.newInstance();
  vtpReader.parseAsArrayBuffer(binary);
  console.log('polydata', vtpReader.getOutputData(0).toJSON());
  vtpReader.getOutputData(0).getLines().setData([]);
  const polydata = vtpReader.getOutputData(0);
  const mapper = vtkMapper.newInstance();
  const actor = vtkActor.newInstance();
  actor.getProperty().setRepresentation(1);
  actor.getProperty().setEdgeVisibility(true);
  mapper.setInputData(polydata);
  // ---------------------------初始化开始---------------------------
  // 初始化==>与polydataMapper进行关联==>renderable.getViewSpecificProperties()
  const mapperViewProp = mapper.getViewSpecificProperties(); // 对象
  mapperViewProp.OpenGL = {
    ShaderReplacements: [],
  };
  // console.log('mapperViewProp.OpenGL::', mapperViewProp.OpenGL);
  mapperViewProp.addShaderReplacements = (
    _shaderType, // 需要编辑的shader类型
    _originalValue, // 要替换的值
    _replaceFirst, // true:在默认值之前完成替换，false==>反之之后完成替换
    _replacementValue, // 替换值N
    _replaceAll // true:定义只需要替换第一次出现,false:全部替换
  ) => {
    mapperViewProp.OpenGL.ShaderReplacements.push({
      shaderType: _shaderType,
      originalValue: _originalValue,
      replaceFirst: _replaceFirst,
      replacementValue: _replacementValue,
      replaceAll: _replaceAll,
    });
  };
  // ---------------------------初始化结束---------------------------

  // --------------------------着色器替换部分--------------------------
  mapperViewProp.addShaderReplacements(
    'Fragment',
    '//VTK::Light::Impl',
    false,
    '//VTK::Light::Impl\nif(gl_FragData[0].g > 0.0)\n{\ngl_FragData[0].r = 1.0;\ngl_FragData[0].g = 1.0;\ngl_FragData[0].b = 1.0;\n}\n',
    false
  );

  actor.setMapper(mapper);
  renderer.addActor(actor);
  resetCamera();
  render();

  // ----------------------------------------------------------------------------
  // Setup picking interaction
  // ----------------------------------------------------------------------------
  // Only try to pick cone points
  const pointPicker = vtkPointPicker.newInstance();
  console.log('pointPicker', pointPicker);
  pointPicker.setPickFromList(1);
  pointPicker.initializePickList();
  pointPicker.addPickList(actor);
  pointPicker.setTolerance(0.001) // 0.25

  console.log('renderWindow.getInteractor()', renderWindow.getInteractor());
  // Pick on mouse right click
  renderWindow.getInteractor().onRightButtonPress((callData) => {
    if (renderer !== callData.pokedRenderer) {
      return;
    }
    console.log('pointPicker', pointPicker);
    const pos = callData.position;
    const point = [pos.x, pos.y, 0.0];
    console.log(`Pick at: ${point}`);
    pointPicker.pick(point, renderer);
    if (pointPicker.getActors().length === 0) {
      const pickedPoint = pointPicker.getPickPosition();
      console.log(`No point picked, default: ${pickedPoint}`);
      const sphere = vtkSphereSource.newInstance();
      sphere.setCenter(pickedPoint);
      sphere.setRadius(0.01);
      const sphereMapper = vtkMapper.newInstance();
      sphereMapper.setInputData(sphere.getOutputData());
      const sphereActor = vtkActor.newInstance();
      sphereActor.setMapper(sphereMapper);
      sphereActor.getProperty().setColor(1.0, 0.0, 0.0);
      renderer.addActor(sphereActor);
    } else {
      const pickedPointId = pointPicker.getPointId();
      console.log('Picked point: ', pickedPointId);
      const pickedPoints = pointPicker.getPickedPositions();
      for (let i = 0; i < pickedPoints.length; i++) {
        const pickedPoint = pickedPoints[i];
        console.log(`Picked: ${pickedPoint}`);
        const sphere = vtkSphereSource.newInstance();
        sphere.setCenter(pickedPoint);
        sphere.setRadius(0.01);
        const sphereMapper = vtkMapper.newInstance();
        sphereMapper.setInputData(sphere.getOutputData());
        const sphereActor = vtkActor.newInstance();
        sphereActor.setMapper(sphereMapper);
        sphereActor.getProperty().setColor(0.0, 1.0, 0.0);
        renderer.addActor(sphereActor);
      }
    }
    renderWindow.render();
  });

  const cellPicker = vtkCellPicker.newInstance();
  console.log('pointPicker', pointPicker);
  cellPicker.setPickFromList(1);
  cellPicker.initializePickList();
  cellPicker.addPickList(actor);
  cellPicker.setTolerance(0);
  let startPosition = {};
  renderWindow.getInteractor().onLeftButtonPress((callData) => {
    startPosition = callData.position;
  });
  renderWindow.getInteractor().onLeftButtonRelease((callData) => {
    if (
      renderer !== callData.pokedRenderer ||
      startPosition.x !== callData.position.x ||
      startPosition.y !== callData.position.y
    ) {
      return;
    }
    const pos = callData.position;
    const point = [pos.x, pos.y, 0.0];
    cellPicker.pick(point, renderer);
    const pickedCellId = cellPicker.getCellId();
    const filter = vtkCalculator.newInstance();
    filter.setInputData(vtpReader.getOutputData(0));
    filter.setFormula({
      getArrays: () => ({
        input: [],
        output: [
          {
            // 修改数组存储位置
            location: FieldDataTypes.POINT,
            // location: FieldDataTypes.CELL,
            name: 'MyColorsArray',
            dataType: 'Float64Array',
            attribute: AttributeTypes.SCALARS,
            numberOfComponents: 3
          }
        ]
      }),
      evaluate: (arraysIn, arraysOut) => {
        const dataArray = arraysOut[0];
        console.log('arraysOut', dataArray.getNumberOfTuples());
        // 可能是因为WebGL给每个顶点设置上颜色，由于WebGL会给两个不同顶点颜色进行内插像素，从而导致渐变的效果  
        for (let i = 0; i < 1600; i++) {
          dataArray.setTuple(i, [1, 0, 0]);
        }
        for (let i = 1600; i < 4123; i++) {
          dataArray.setTuple(i, [1, 1, 1]);
        }
        // 插入第几号Cell的数据
        // dataArray.setTuple(1, [255, 0, 0]); // 发现的规律是：CellData渲染的是最后一根线，搞明白这里是怎么计算的

        for (let i = 3; i < 60; i++) {
          dataArray.setTuple(i, [255, 255, 255]);
        }
      }
    });

    mapper.setInputConnection(filter.getOutputPort());
    mapper.set({
      colorByArrayName: "MyColorsArray",
      colorMode: ColorMode.DIRECT_SCALARS, // 所有数组都会被认作是颜色,该方法执行默认的映射器行为，即把unsigned char类型的标量属性数据当作颜色值，不执行隐式,并不需要通过查询表进行映射。
      scalarMode: ScalarMode.USE_POINT_DATA,// 总是使用点标量属性数据进行映射的
    });
    renderWindow.render();
  });
});