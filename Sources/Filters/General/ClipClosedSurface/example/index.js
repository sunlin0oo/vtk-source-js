/* eslint-disable import/no-unresolved */
/* eslint-disable no-unused-vars */
import 'vtk.js/Sources/favicon';

// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import 'vtk.js/Sources/Rendering/Profiles/Geometry';

import vtkFullScreenRenderWindow from 'vtk.js/Sources/Rendering/Misc/FullScreenRenderWindow';
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkCamera from 'vtk.js/Sources/Rendering/Core/Camera';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import vtkPlane from 'vtk.js/Sources/Common/DataModel/Plane';
import vtkClipClosedSurface from 'vtk.js/Sources/Filters/General/ClipClosedSurface';
import vtkSphereSource from 'vtk.js/Sources/Filters/Sources/SphereSource';
import vtkXMLPolyDataReader from 'vtk.js/Sources/IO/XML/XMLPolyDataReader';
import vtkPolyData from 'vtk.js/Sources/Common/DataModel/PolyData';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import HttpDataAccessHelper from 'vtk.js/Sources/IO/Core/DataAccessHelper/HttpDataAccessHelper';
// import displacementData from '../../../../../Data/JSON/displacement.json';

const fileName = 'beam.vtp';
// ----------------------------------------------------------------------------
// Example code
// ----------------------------------------------------------------------------

const reader = vtkXMLPolyDataReader.newInstance();
// console.log('displacementData', displacementData);
const actor = vtkActor.newInstance();
const mapper = vtkMapper.newInstance({ interpolateScalarBeforeMapping: true });
actor.setMapper(mapper);
const NAMED_COLORS = {
  BANANA: [255 / 255, 255 / 255, 255 / 255], // color2==>clipColor
  TOMATO: [255 / 255, 0 / 255, 0 / 255], // color1==>baseColor
  SANDY_BROWN: [244 / 255, 164 / 255, 96 / 255], // color3
};

// ----------------------------------------------------------------------------

function update() {
  const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance();
  const renderer = fullScreenRenderer.getRenderer();
  const renderWindow = fullScreenRenderer.getRenderWindow();

  const resetCamera = renderer.resetCamera;
  const render = renderWindow.render;

  const cam = vtkCamera.newInstance();
  renderer.setActiveCamera(cam);
  cam.setFocalPoint(0, 0, 0);
  cam.setPosition(0, 0, 10);
  cam.setClippingRange(0.1, 50.0);

  // Build pipeline
  // --------------------- 设置球体 ---------------------
  // const source = vtkSphereSource
  //   .newInstance({
  //     thetaResolution: 20,
  //     phiResolution: 11,
  //   })
  //   .getOutputData();
  // --------------------- END ---------------------
  const sourcePoly = reader.getOutputData(0);
  // --------------------- 设置output 仅有外边框的 ---------------------
  const source = reader.getOutputData(0);
  console.log('sourcePoly', source.toJSON());
  const inputLines = sourcePoly.getLines();
  source.getPolys().setData(inputLines.getData());
  // --------------------- END ---------------------
  // 获取边缘
  // const bounds = source.getOutputData().getBounds();
  const bounds = source.getBounds();
  // 获得中心点
  const center = [
    (bounds[1] + bounds[0]) / 2,
    (bounds[3] + bounds[2]) / 2,
    (bounds[5] + bounds[4]) / 2,
  ];

  const planes = [];
  const plane1 = vtkPlane.newInstance({
    origin: center,
    normal: [1.0, 0.0, 0.0], // x轴
  });
  planes.push(plane1);

  // const plane2 = vtkPlane.newInstance({
  //   origin: center,
  //   normal: [0.0, 1.0, 0.0], // y轴
  // });
  // planes.push(plane2);

  // const plane3 = vtkPlane.newInstance({
  //   origin: center,
  //   normal: [0.0, 0.0, 1.0], // z轴
  // });
  // planes.push(plane3);
  // console.time('Filter');
  const filter = vtkClipClosedSurface.newInstance({
    clippingPlanes: planes, // 设定一组用来裁剪的隐函数平面集合
    activePlaneId: 2, // 如果设置了ActivePlaneId，则为通过使用ActivePlane剪裁生成的任何新几何体设置颜色。 设定当前活动平面ID为2==>对应数组的索引
    passPointData: true, // 可以获取到顶点的标量==>Pass data from one fieldData to another at the given index==>passData方法于DataSetAttributes类中
    // clipColor: NAMED_COLORS.BANANA,
    // baseColor: NAMED_COLORS.TOMATO,
    // activePlaneColor: NAMED_COLORS.SANDY_BROWN,
    // GenerateOutline: true, // 控制是否在输入面被平面切割的位置生成轮廓
    // generateFaces: true, // 设置是否为输出生成多边形面此选项处于启用状态。如果关闭，则输出将没有poly。
    // triangulatePolys: true,
    // tolerance: true,
  });

  // filter.setInputConnection(source);
  filter.setInputData(source);
  filter.setScalarModeToColors();
  // filter.setScalarModeToNone();
  filter.update();
  const filterData = filter.getOutputData();
  console.timeEnd('Filter');
  console.log('filterData', filterData.toJSON());
  mapper.setInputData(filterData);
  actor.getProperty().setRepresentation(2);

  // -----------------------------------------------------------
  // console.time('render');
  renderer.resetCamera();
  renderWindow.render();
  renderer.addActor(actor);
  resetCamera();
  render();
  console.timeEnd('render');
}

// ----------------------------------------------------------------------------
// Use a file reader to load a local file
// ----------------------------------------------------------------------------
HttpDataAccessHelper.fetchBinary(
  `${__BASE_PATH__}/data/model/${fileName}`
).then((binary) => {
  reader.parseAsArrayBuffer(binary, true);
  update();
});
// const myContainer = document.querySelector('body');
// const fileContainer = document.createElement('div');
// fileContainer.innerHTML = '<input type="file" class="file"/>';
// myContainer.appendChild(fileContainer);

// const fileInput = fileContainer.querySelector('input');

// function handleFile(event) {
//   event.preventDefault();
//   const dataTransfer = event.dataTransfer;
//   const files = event.target.files || dataTransfer.files;
//   if (files.length === 1) {
//     myContainer.removeChild(fileContainer);
//     const fileReader = new FileReader();
//     fileReader.onload = function onLoad(e) {
//       reader.parseAsArrayBuffer(fileReader.result, true);
//       update();
//     };
//     fileReader.readAsArrayBuffer(files[0]);
//   }
// }

// fileInput.addEventListener('change', handleFile);
