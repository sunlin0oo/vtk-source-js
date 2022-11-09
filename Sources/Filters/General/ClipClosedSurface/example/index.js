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
import displacementData from '../../../../../Data/JSON/displacement.json';

// ----------------------------------------------------------------------------
// Example code
// ----------------------------------------------------------------------------

const reader = vtkXMLPolyDataReader.newInstance();
console.log('displacementData', displacementData);
const actor = vtkActor.newInstance();
const mapper = vtkMapper.newInstance({ interpolateScalarBeforeMapping: true });
actor.setMapper(mapper);
// const NAMED_COLORS = {
//   BANANA: [110 / 255, 207 / 255, 87 / 255], // color2
//   TOMATO: [255 / 255, 99 / 255, 71 / 255], // color1
//   SANDY_BROWN: [244 / 255, 164 / 255, 96 / 255], // color3
// };

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
  const source = reader.getOutputData(0);
  console.log('source', source.getCellData());
  const sourcePoly = reader.getOutputData(2);
  // --------------------- 设置output ---------------------
  console.log('sourcePoly', sourcePoly.toJSON());
  const inputLines = source.getLines();
  sourcePoly.getPolys().setData(inputLines.getData());
  // const offsetVBO = new Float32Array(inputLines.getData().length);
  // let offsetVBOIndex = 0;
  // eslint-disable-next-line array-callback-return
  // Object.values(displacementData).map((value) => {
  //   offsetVBOIndex++;
  //   offsetVBO[offsetVBOIndex] = value * 100;
  // });
  // sourcePoly.getCellData().setScalars(
  //   vtkDataArray.newInstance({
  //     name: 'Normals',
  //     values: offsetVBO,
  //     numberOfComponents: 3,
  //   })
  // );
  // --------------------- END ---------------------
  const bounds = source.getBounds();
  const center = [
    (bounds[1] + bounds[0]) / 2,
    (bounds[3] + bounds[2]) / 2,
    (bounds[5] + bounds[4]) / 2,
  ];
  const planes = [];
  const plane1 = vtkPlane.newInstance({
    origin: center,
    normal: [1.0, 0.0, 0.0],
  });
  planes.push(plane1);
  const plane2 = vtkPlane.newInstance({
    origin: center,
    normal: [0.0, 1.0, 0.0],
  });
  // planes.push(plane2);
  // const plane3 = vtkPlane.newInstance({
  //   origin: center,
  //   normal: [0.0, 0.0, 1.0],
  // });
  // planes.push(plane3);

  const filter = vtkClipClosedSurface.newInstance({
    clippingPlanes: planes,
    activePlaneId: 2,
    passPointData: true,
  });
  filter.setInputData(sourcePoly);
  filter.setScalarModeToNone();
  filter.update();
  const filterData = filter.getOutputData();
  console.log('filterData', filterData.toJSON());
  mapper.setInputData(sourcePoly);
  actor.getProperty().setRepresentation(2);
  // -----------------------------------------------------------

  renderer.resetCamera();
  renderWindow.render();

  renderer.addActor(actor);
  resetCamera();
  render();
}

// ----------------------------------------------------------------------------
// Use a file reader to load a local file
// ----------------------------------------------------------------------------

const myContainer = document.querySelector('body');
const fileContainer = document.createElement('div');
fileContainer.innerHTML = '<input type="file" class="file"/>';
myContainer.appendChild(fileContainer);

const fileInput = fileContainer.querySelector('input');

function handleFile(event) {
  event.preventDefault();
  const dataTransfer = event.dataTransfer;
  const files = event.target.files || dataTransfer.files;
  if (files.length === 1) {
    myContainer.removeChild(fileContainer);
    const fileReader = new FileReader();
    fileReader.onload = function onLoad(e) {
      reader.parseAsArrayBuffer(fileReader.result, true);
      update();
    };
    fileReader.readAsArrayBuffer(files[0]);
  }
}

fileInput.addEventListener('change', handleFile);
