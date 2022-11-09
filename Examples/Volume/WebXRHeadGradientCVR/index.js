import { mat4 } from 'gl-matrix';
import 'vtk.js/Sources/favicon';

// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import 'vtk.js/Sources/Rendering/Profiles/Volume';

// Force DataAccessHelper to have access to various data source
import 'vtk.js/Sources/IO/Core/DataAccessHelper/HtmlDataAccessHelper';
import 'vtk.js/Sources/IO/Core/DataAccessHelper/JSZipDataAccessHelper';

import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkFullScreenRenderWindow from 'vtk.js/Sources/Rendering/Misc/FullScreenRenderWindow';
import HttpDataAccessHelper from 'vtk.js/Sources/IO/Core/DataAccessHelper/HttpDataAccessHelper';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkURLExtract from 'vtk.js/Sources/Common/Core/URLExtract';
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';
import vtkXMLImageDataReader from 'vtk.js/Sources/IO/XML/XMLImageDataReader';
import vtkImageReslice from 'vtk.js/Sources/Imaging/Core/ImageReslice';
import vtkMath from 'vtk.js/Sources/Common/Core/Math';

import './WebXRVolume.module.css';

// ----------------------------------------------------------------------------
// Standard rendering code setup
// ----------------------------------------------------------------------------

const background = [0, 0, 0];
const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
  background,
});
const renderer = fullScreenRenderer.getRenderer();
const renderWindow = fullScreenRenderer.getRenderWindow();

// ----------------------------------------------------------------------------
// Set up pipeline objects
// ----------------------------------------------------------------------------

const vtiReader = vtkXMLImageDataReader.newInstance();
const reslicer = vtkImageReslice.newInstance();
const actor = vtkVolume.newInstance();
const mapper = vtkVolumeMapper.newInstance();
reslicer.setInputConnection(vtiReader.getOutputPort());
mapper.setInputConnection(reslicer.getOutputPort());
actor.setMapper(mapper);
renderer.addVolume(actor);

// create color and opacity transfer functions
const ctfun = vtkColorTransferFunction.newInstance();
const ofun = vtkPiecewiseFunction.newInstance();

// ----------------------------------------------------------------------------
// Example code
// ----------------------------------------------------------------------------

const {
  fileURL = 'https://data.kitware.com/api/v1/file/59de9dca8d777f31ac641dc2/download',
} = vtkURLExtract.extractURLParameters();

HttpDataAccessHelper.fetchBinary(fileURL).then((fileContents) => {
  // Read data
  vtiReader.parseAsArrayBuffer(fileContents);

  // Rotate 90 degrees forward so that default head volume faces camera
  const rotateX = mat4.create();
  mat4.fromRotation(rotateX, vtkMath.radiansFromDegrees(90), [-1, 0, 0]);
  reslicer.setResliceAxes(rotateX);

  const data = reslicer.getOutputData(0);

  // Restyle visual appearance
  const sampleDistance =
    0.7 *
    Math.sqrt(
      data
        .getSpacing()
        .map((v) => v * v)
        .reduce((a, b) => a + b, 0)
    );
  mapper.setSampleDistance(sampleDistance);

  ofun.addPoint(0.0, 0.0);
  ofun.addPoint(1100.58, 0.0117188);
  ofun.addPoint(2334.07, 0.808594);
  ofun.addPoint(3305.9, 0.0);
  ofun.addPoint(4095, 0.0);
  ctfun.addRGBPoint(0.0, 0.0, 0.0, 0.0);
  ctfun.addRGBPoint(490.071, 0.901961, 0.0, 0.0);
  ctfun.addRGBPoint(1449.45, 0.866667, 0.0745098, 0.0196078);
  ctfun.addRGBPoint(1511.74, 0.631373, 0.552941, 0.152941);
  ctfun.addRGBPoint(2321.61, 0.992157, 0.992157, 0.984314);
  ctfun.addRGBPoint(4095, 1.0, 1.0, 1.0);
  actor.getProperty().setRGBTransferFunction(0, ctfun);
  actor.getProperty().setScalarOpacity(0, ofun);
  actor.getProperty().setInterpolationTypeToLinear();

  // CVR
  actor.getProperty().setShade(true);
  mapper.setGlobalIlluminationReach(0.0);
  mapper.setVolumetricScatteringBlending(0.0);
  mapper.setVolumeShadowSamplingDistFactor(1.0);
  mapper.setAutoAdjustSampleDistances(false);

  // Set up rendering
  renderer.resetCamera();
  renderWindow.render();

  // Add button to launch AR (default) or VR scene
  const VR = 1;
  const AR = 2;
  let xrSessionType = 0;
  const xrButton = document.createElement('button');
  let enterText = 'XR not available!';
  const exitText = 'Exit XR';
  xrButton.textContent = enterText;
  if (
    navigator.xr !== undefined &&
    fullScreenRenderer.getApiSpecificRenderWindow().getXrSupported()
  ) {
    navigator.xr.isSessionSupported('immersive-ar').then((arSupported) => {
      if (arSupported) {
        xrSessionType = AR;
        enterText = 'Start AR';
        xrButton.textContent = enterText;
      } else {
        navigator.xr.isSessionSupported('immersive-vr').then((vrSupported) => {
          if (vrSupported) {
            xrSessionType = VR;
            enterText = 'Start VR';
            xrButton.textContent = enterText;
          }
        });
      }
    });
  }
  xrButton.addEventListener('click', () => {
    if (xrButton.textContent === enterText) {
      if (xrSessionType === AR) {
        fullScreenRenderer.setBackground([0, 0, 0, 0]);
      }
      fullScreenRenderer
        .getApiSpecificRenderWindow()
        .startXR(xrSessionType === AR);
      xrButton.textContent = exitText;
    } else {
      fullScreenRenderer.setBackground([...background, 255]);
      fullScreenRenderer
        .getApiSpecificRenderWindow()
        .stopXR(xrSessionType === AR);
      xrButton.textContent = enterText;
    }
  });
  document.querySelector('.content').appendChild(xrButton);
});

// -----------------------------------------------------------
// Make some variables global so that you can inspect and
// modify objects in your browser's developer console:
// -----------------------------------------------------------

global.source = vtiReader;
global.mapper = mapper;
global.actor = actor;
global.ctfun = ctfun;
global.ofun = ofun;
global.renderer = renderer;
global.renderWindow = renderWindow;
