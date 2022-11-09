/* eslint-disable import/no-unresolved */
/* eslint-disable array-callback-return */
/* eslint-disable no-unused-vars */
/* eslint-disable import/prefer-default-export */
/* eslint-disable import/no-extraneous-dependencies */

import 'vtk.js/Sources/favicon';

// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import 'vtk.js/Sources/Rendering/Profiles/Geometry';
import lodash from 'lodash';
import { formatBytesToProperUnit, debounce } from 'vtk.js/Sources/macros';
import HttpDataAccessHelper from 'vtk.js/Sources/IO/Core/DataAccessHelper/HttpDataAccessHelper';
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkScalarBarActor from 'vtk.js/Sources/Rendering/Core/ScalarBarActor';
import vtkColorMaps from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction/ColorMaps';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkFullScreenRenderWindow from 'vtk.js/Sources/Rendering/Misc/FullScreenRenderWindow';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import vtkURLExtract from 'vtk.js/Sources/Common/Core/URLExtract';
import vtkXMLPolyDataReader from 'vtk.js/Sources/IO/XML/XMLPolyDataReader';
import vtkFPSMonitor from 'vtk.js/Sources/Interaction/UI/FPSMonitor';

// Force DataAccessHelper to have access to various data source
import 'vtk.js/Sources/IO/Core/DataAccessHelper/HtmlDataAccessHelper';
import 'vtk.js/Sources/IO/Core/DataAccessHelper/JSZipDataAccessHelper';

import {
  ColorMode,
  ScalarMode,
} from 'vtk.js/Sources/Rendering/Core/Mapper/Constants';

import style from './GeometryViewer.module.css';
import icon from '../../../Documentation/content/icon/favicon-96x96.png';
import displacementData from '../../../Data/JSON/displacement_x.json';

let autoInit = true;
let background = [0, 0, 0];
let fullScreenRenderWindow;
let renderWindow;
let renderer;
let scalarBarActor;

global.pipeline = {};

// Process arguments from URL
const userParams = vtkURLExtract.extractURLParameters();
// Background handling
if (userParams.background) {
  background = userParams.background.split(',').map((s) => Number(s));
}
const selectorClass =
  background.length === 3 && background.reduce((a, b) => a + b, 0) < 1.5
    ? style.dark
    : style.light;
// 设置颜色映射表名称
// lut
const lutName = userParams.lut || 'erdc_rainbow_bright';
console.log('lutName', lutName);
// field
const field = userParams.field || '';
console.log('field', field);

// camera
function updateCamera(camera) {
  ['zoom', 'pitch', 'elevation', 'yaw', 'azimuth', 'roll', 'dolly'].forEach(
    (key) => {
      if (userParams[key]) {
        camera[key](userParams[key]);
      }
      renderWindow.render();
    }
  );
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

// ----------------------------------------------------------------------------
// DOM containers for UI control
// ----------------------------------------------------------------------------

const rootControllerContainer = document.createElement('div');
rootControllerContainer.setAttribute('class', style.rootController);

const addDataSetButton = document.createElement('img');
addDataSetButton.setAttribute('class', style.button);
addDataSetButton.setAttribute('src', icon);
addDataSetButton.addEventListener('click', () => {
  const isVisible = rootControllerContainer.style.display !== 'none';
  rootControllerContainer.style.display = isVisible ? 'none' : 'flex';
});

const fpsMonitor = vtkFPSMonitor.newInstance();
const fpsElm = fpsMonitor.getFpsMonitorContainer();
fpsElm.classList.add(style.fpsMonitor);

// ----------------------------------------------------------------------------
// Add class to body if iOS device
// ----------------------------------------------------------------------------

const iOS = /iPad|iPhone|iPod/.test(window.navigator.platform);

if (iOS) {
  document.querySelector('body').classList.add('is-ios-device');
}

// ----------------------------------------------------------------------------

function emptyContainer(container) {
  fpsMonitor.setContainer(null);
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}
// 每次改变视角都会重新执行自定义函数进行重定义渲染
function customShader(mapper, offsetVBO) {
  console.log('Custom-执行');
  // ---------------------------初始化开始---------------------------
  // 初始化==>与polydataMapper进行关联==>renderable.getViewSpecificProperties()
  const mapperViewProp = mapper.getViewSpecificProperties(); // 对象
  console.log('Custom-mapperViewProp', mapperViewProp);
  mapperViewProp.OpenGL = {
    ShaderReplacements: [],
  };
  console.log('Custom-mapperViewProp.OpenGL::', mapperViewProp.OpenGL);
  mapperViewProp.addShaderReplacements = (
    _shaderType, // 需要编辑的shader类型
    _originalValue, // 要替换的值
    _replaceFirst, // true:在默认值之前完成替换，false==>反之之后完成替换
    _replacementValue, // 替换值
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

  // --------------------------uniform1f添加--------------------------
  const uniform1f = 1.0;
  // 进行函数的回调===>进行参数的调用
  mapperViewProp.ShadersCallbacks = [];

  // 添加形变系数作为Uniformi属性
  mapperViewProp.ShadersCallbacks.push({
    // ShaderProgam中进行查阅==>什么情况传什么样的参数
    userData: uniform1f,
    callback(userData, cellBO, ren, _actor) {
      console.log('Custom-cellBO', cellBO);
      const program = cellBO.getProgram();
      console.log('Custom-program', program);
      program.setUniformf('deformation', userData);
    },
  });
  console.log(
    'Custom-mapperViewProp.ShadersCallbacks',
    mapperViewProp.ShadersCallbacks
  );
  // --------------------------uniform1f添加结束--------------------------

  // --------------------------着色器替换部分--------------------------
  mapperViewProp.addShaderReplacements(
    'Vertex',
    '//VTK::PositionVC::Dec',
    true,
    '//VTK::PositionVC::Dec\nuniform float deformation;\n',
    false
  );

  mapperViewProp.addShaderReplacements(
    'Vertex',
    '//VTK::PositionVC::Dec',
    true,
    // '//VTK::PositionVC::Dec\nlayout(location = 1) in vec4 vertexOffsetMC;\n',
    '//VTK::PositionVC::Dec\nattribute vec4 vertexOffsetMC;\n',
    false
  );

  mapperViewProp.addShaderReplacements(
    'Vertex',
    '//VTK::PositionVC::Impl', // Implementation of shader code for handling normals  用于处理法线着色器的实现==>调用变量用这个
    true,
    '//VTK::PositionVC::Impl\n  gl_Position = MCPCMatrix * (vertexMC + vertexOffsetMC * deformation) ;\n', // 未将vertexOffsetMC传入,这里的数值参数仍是坐标值
    false
  );
  // --------------------------着色器源码替换部分结束--------------------------

  // --------------------------attribute添加--------------------------
  // 添加偏移量作为attribute属性
  mapperViewProp.ShadersCallbacks.push({
    userData: offsetVBO,
    // 修改源码。==>callbakc函数添加属性model
    callback(userData, cellBO, ren, _actor, model) {
      console.log('Custom-回调函数中model', model);
      const gl = model.context;
      // 创建缓冲区对象
      model.vertexBuffer = gl.createBuffer();
      console.log('Custom-model.vertexBuffer', model.vertexBuffer);
      // 将缓冲区对象绑定到目标
      gl.bindBuffer(gl.ARRAY_BUFFER, model.vertexBuffer);
      // console.log(userData);
      // 向缓冲区中写入数据
      gl.bufferData(gl.ARRAY_BUFFER, userData, gl.STATIC_DRAW);
      // ----------------- End -----------------

      // ----------------- 启用顶点坐标数据数组(VAO)开启attribute变量-----------------
      console.log('Custom-回调函数中cellBO.getCABO()', cellBO.getCABO());
      if (cellBO.getProgram().isAttributeUsed('vertexOffsetMC')) {
        model.handleProgram = cellBO.getProgram().getHandle();
        const paraIndex = gl.getAttribLocation(
          model.handleProgram,
          'vertexOffsetMC'
        );
        gl.enableVertexAttribArray(paraIndex);
        // 将数据传递到顶点属性中==>具体是从哪个VBO（程序中可以有多个VBO）获取则是通过在调用glVetexAttribPointer时绑定到GL_ARRAY_BUFFER的VBO决定的
        gl.vertexAttribPointer(paraIndex, 3, model.context.FLOAT, false, 12, 0);
      } else {
        console.log('Custom-未进行设置');
      }
      // -----------------End-----------------
    },
  });
  // --------------------------attribute添加结束--------------------------
}

// ----------------------------------------------------------------------------
// 创建视图
function createViewer(container) {
  fullScreenRenderWindow = vtkFullScreenRenderWindow.newInstance({
    background,
    rootContainer: container,
    containerStyle: { height: '100%', width: '100%', position: 'absolute' },
  });
  renderer = fullScreenRenderWindow.getRenderer();
  renderWindow = fullScreenRenderWindow.getRenderWindow();
  renderWindow.getInteractor().setDesiredUpdateRate(15);

  container.appendChild(rootControllerContainer);
  container.appendChild(addDataSetButton);

  scalarBarActor = vtkScalarBarActor.newInstance(); // 右侧颜色条
  renderer.addActor(scalarBarActor);

  if (userParams.fps) {
    if (Array.isArray(userParams.fps)) {
      fpsMonitor.setMonitorVisibility(...userParams.fps);
      if (userParams.fps.length === 4) {
        fpsMonitor.setOrientation(userParams.fps[3]);
      }
    }
    fpsMonitor.setRenderWindow(renderWindow);
    fpsMonitor.setContainer(container);
    fullScreenRenderWindow.setResizeCallback(fpsMonitor.update);
  }
}

// ----------------------------------------------------------------------------
// 创建管道，显示渲染模式
function createPipeline(fileName, fileContents) {
  // Create UI
  const presetSelector = document.createElement('select');
  presetSelector.setAttribute('class', selectorClass);
  // 列举预设可选颜色的列表
  console.log('vtkColorMaps.rgbPresetNames', vtkColorMaps.rgbPresetNames);
  presetSelector.innerHTML = vtkColorMaps.rgbPresetNames
    .map(
      (name) =>
        `<option value="${name}" ${
          lutName === name ? 'selected="selected"' : ''
        } name="${name}">${name}</option>`
    )
    .join('');

  const representationSelector = document.createElement('select');
  representationSelector.setAttribute('class', selectorClass);
  representationSelector.innerHTML = [
    'Hidden',
    'Points',
    'Mesh',
    'Surface',
    'Surface with Mesh',
    'Wireframe',
    'WireframewithSurface',
  ]
    .map(
      (name, idx) =>
        `<option value="${idx === 0 ? 0 : 1}:
        ${idx < 4 ? idx - 1 : 2}:
        ${idx === 4 ? 1 : 0}:
        ${name}">${name}</option>`
    )
    .join('');
  representationSelector.value = '1:2:0:Surface';
  // 颜色的选择
  const colorBySelector = document.createElement('select');
  colorBySelector.setAttribute('class', selectorClass);

  const componentSelector = document.createElement('select');
  componentSelector.setAttribute('class', selectorClass);
  componentSelector.style.display = 'none';
  // 透明度
  const opacitySelector = document.createElement('input');
  opacitySelector.setAttribute('class', selectorClass);
  opacitySelector.setAttribute('type', 'range');
  opacitySelector.setAttribute('value', '100');
  opacitySelector.setAttribute('max', '100');
  opacitySelector.setAttribute('min', '1');

  const labelSelector = document.createElement('label');
  labelSelector.setAttribute('class', selectorClass);
  labelSelector.innerHTML = fileName;

  const immersionSelector = document.createElement('button');
  immersionSelector.setAttribute('class', selectorClass);
  immersionSelector.innerHTML = 'Start AR';

  const controlContainer = document.createElement('div');
  controlContainer.setAttribute('class', style.control);
  controlContainer.appendChild(labelSelector);
  controlContainer.appendChild(representationSelector);
  controlContainer.appendChild(presetSelector);
  controlContainer.appendChild(colorBySelector);
  controlContainer.appendChild(componentSelector);
  controlContainer.appendChild(opacitySelector);

  if (
    navigator.xr !== undefined &&
    navigator.xr.isSessionSupported('immersive-ar') &&
    fullScreenRenderWindow.getApiSpecificRenderWindow().getXrSupported()
  ) {
    controlContainer.appendChild(immersionSelector);
  }
  rootControllerContainer.appendChild(controlContainer);

  // VTK pipeline==>初始化
  // 读取文件
  const vtpReader = vtkXMLPolyDataReader.newInstance();
  console.log('vtpReader', vtpReader);
  // 若是相同的数据输入则只会执行一次
  vtpReader.parseAsArrayBuffer(fileContents, true);
  const lookupTable = vtkColorTransferFunction.newInstance();
  const lookupTableLine = vtkColorTransferFunction.newInstance();
  // const source = vtpReader.getOutputData(0);
  const sourceLine = vtpReader.getOutputData(1);
  const sourcePoly = vtpReader.getOutputData(2);
  console.log('source', sourcePoly.toJSON());
  console.log('sourceLine', sourceLine);
  console.log('sourcePoly', sourcePoly);
  const mapperLine = vtkMapper.newInstance({
    interpolateScalarsBeforeMapping: false,
    useLookupTableScalarRange: true,
    lookupTable: lookupTableLine,
    scalarVisibility: false,
  });
  const actorLine = vtkActor.newInstance();
  const mapperPoly = vtkMapper.newInstance({
    interpolateScalarsBeforeMapping: false,
    useLookupTableScalarRange: true,
    lookupTable,
    scalarVisibility: true,
  });
  const actorPoly = vtkActor.newInstance();
  // 会让模型表面的数据进行描述
  // actor.getProperty().setEdgeVisibility(true);
  // 获取到对应数据的标量
  const scalars = sourcePoly.getPointData().getScalars();
  console.log('scalars', scalars);
  const dataRange = [].concat(scalars ? scalars.getRange() : [0, 1]);
  let activeArray = vtkDataArray;

  // --------------------------------------------------------------------
  // Color handling
  // --------------------------------------------------------------------
  // 应用预设的颜色
  function applyPreset() {
    const preset = vtkColorMaps.getPresetByName(presetSelector.value);
    lookupTable.applyColorMap(preset);
    lookupTable.setMappingRange(dataRange[0], dataRange[1]);
    lookupTable.updateRange();
    lookupTableLine.applyColorMap(preset);
    lookupTableLine.setMappingRange(dataRange[0], dataRange[1]);
    lookupTableLine.updateRange();
    renderWindow.render();
  }
  applyPreset();
  presetSelector.addEventListener('change', applyPreset);
  let passWireFlag = false;
  // --------------------------------------------------------------------
  // Representation handling
  // --------------------------------------------------------------------
  // 更新视图
  function updateRepresentation(event) {
    const array = event.target.value.replace(/\s*/g, '').split(':');
    const id = array.pop();
    const [visibility, representation, edgeVisibility] = array.map(Number);
    console.log('[visibility, representation, edgeVisibility]', [
      visibility,
      representation,
      edgeVisibility,
    ]);
    actorPoly.getProperty().set({ representation, edgeVisibility });
    actorPoly.setVisibility(!!visibility);
    if (passWireFlag) {
      renderer.removeAllActors();
      renderer.addActor(actorPoly);
      passWireFlag = false;
    }
    if (id === 'Wireframe') {
      console.log('我执行了!!Wireframe');
      renderer.removeAllActors();
      actorLine.getProperty().set({
        representation: 1,
        edgeVisibility: 1,
      });
      mapperLine.set({
        scalarVisibility: true,
      });
      // actorLine.getProperty().setColor([1, 1, 1]); // 处理没有属性的情况
      passWireFlag = true;
      renderer.addActor(actorLine);
    } else if (id === 'WireframewithSurface') {
      renderer.removeAllActors();
      passWireFlag = true;
      mapperLine.set({
        scalarVisibility: false,
      });
      actorLine.getProperty().setColor([0, 0, 0]);
      actorLine.getProperty().setLineWidth(4);
      renderer.addActor(actorLine);
      renderer.addActor(actorPoly);
    }
    renderWindow.render();
  }
  representationSelector.addEventListener('change', updateRepresentation);

  // --------------------------------------------------------------------
  // Opacity handling
  // --------------------------------------------------------------------
  // 更新透明度
  function updateOpacity(event) {
    const opacity = Number(event.target.value) / 100;
    actorPoly.getProperty().setOpacity(opacity);
    actorLine.getProperty().setOpacity(opacity);
    renderWindow.render();
  }

  opacitySelector.addEventListener('input', updateOpacity);
  const pointValueLen = sourcePoly.getPoints().get().values.length;
  // console.log('displacementData:::', displacementData);
  console.log('pointValueLen', pointValueLen);
  const offsetVBO = new Float32Array(pointValueLen * 3);
  let offsetVBOIndex = 0;
  Object.values(displacementData).map((value) => {
    offsetVBO[offsetVBOIndex] = value * 50.0;
    offsetVBOIndex++;
  });
  customShader(mapperPoly, offsetVBO);
  customShader(mapperLine, offsetVBO);
  // --------------------------------------------------------------------
  // ColorBy handling===>渲染颜色的关键==>vtp中会存储vtp
  // --------------------------------------------------------------------
  const colorByOptions = [{ value: ':', label: 'Solid color' }].concat(
    sourcePoly
      .getPointData() // 特殊属性数据
      .getArrays()
      .map((a) => ({
        label: `(p) ${a.getName()}`,
        value: `PointData:${a.getName()}`,
      })),
    sourcePoly
      .getCellData()
      .getArrays()
      .map((a) => ({
        label: `(c) ${a.getName()}`,
        value: `CellData:${a.getName()}`,
      }))
  );
  console.log('colorByOptions', colorByOptions);
  colorBySelector.innerHTML = colorByOptions
    .map(
      ({ label, value }) =>
        `<option value="${value}" ${
          field === value ? 'selected="selected"' : ''
        }>${label}</option>`
    )
    .join('');

  function updateColorBy(event) {
    const [location, colorByArrayName] = event.target.value.split(':');
    const interpolateScalarsBeforeMapping = location === 'PointData';
    let colorMode = ColorMode.DEFAULT;
    let scalarMode = ScalarMode.DEFAULT;
    const scalarVisibility = location.length > 0;
    if (scalarVisibility) {
      const newArray =
        sourcePoly[`get${location}`]().getArrayByName(colorByArrayName);
      activeArray = newArray;
      const newDataRange = activeArray.getRange();
      dataRange[0] = newDataRange[0];
      dataRange[1] = newDataRange[1];
      colorMode = ColorMode.MAP_SCALARS;
      scalarMode =
        location === 'PointData'
          ? ScalarMode.USE_POINT_FIELD_DATA
          : ScalarMode.USE_CELL_FIELD_DATA;

      const numberOfComponents = activeArray.getNumberOfComponents();
      if (numberOfComponents > 1) {
        // always start on magnitude setting
        if (mapperPoly.getLookupTable()) {
          const lut = mapperPoly.getLookupTable();
          lut.setVectorModeToMagnitude();
        }
        if (mapperLine.getLookupTable()) {
          const lut = mapperLine.getLookupTable();
          lut.setVectorModeToMagnitude();
        }
        componentSelector.style.display = 'block';
        const compOpts = ['Magnitude'];
        while (compOpts.length <= numberOfComponents) {
          compOpts.push(`Component ${compOpts.length}`);
        }
        componentSelector.innerHTML = compOpts
          .map((t, index) => `<option value="${index - 1}">${t}</option>`)
          .join('');
      } else {
        componentSelector.style.display = 'none';
      }
      scalarBarActor.setAxisLabel(colorByArrayName);
      scalarBarActor.setVisibility(true);
    } else {
      componentSelector.style.display = 'none';
      scalarBarActor.setVisibility(false);
    }
    mapperPoly.set({
      colorByArrayName,
      colorMode,
      interpolateScalarsBeforeMapping,
      scalarMode,
      scalarVisibility,
    });
    mapperLine.set({
      colorByArrayName,
      colorMode,
      interpolateScalarsBeforeMapping,
      scalarMode,
    });
    applyPreset();
  }
  colorBySelector.addEventListener('change', updateColorBy);
  updateColorBy({ target: colorBySelector });

  function updateColorByComponent(event) {
    if (mapperPoly.getLookupTable()) {
      const lut = mapperPoly.getLookupTable(); // 颜色配置
      if (event.target.value === -1) {
        lut.setVectorModeToMagnitude();
      } else {
        lut.setVectorModeToComponent();
        lut.setVectorComponent(Number(event.target.value));
        const newDataRange = activeArray.getRange(Number(event.target.value));
        dataRange[0] = newDataRange[0];
        dataRange[1] = newDataRange[1];
        lookupTable.setMappingRange(dataRange[0], dataRange[1]);
        lut.updateRange();
      }
      renderWindow.render();
    }
    if (mapperLine.getLookupTable()) {
      const lut = mapperLine.getLookupTable(); // 颜色配置
      if (event.target.value === -1) {
        lut.setVectorModeToMagnitude();
      } else {
        lut.setVectorModeToComponent();
        lut.setVectorComponent(Number(event.target.value));
        const newDataRange = activeArray.getRange(Number(event.target.value));
        dataRange[0] = newDataRange[0];
        dataRange[1] = newDataRange[1];
        lookupTable.setMappingRange(dataRange[0], dataRange[1]);
        lut.updateRange();
      }
      renderWindow.render();
    }
  }
  componentSelector.addEventListener('change', updateColorByComponent);

  // --------------------------------------------------------------------
  // Immersion handling
  // --------------------------------------------------------------------

  function toggleAR() {
    const SESSION_IS_AR = true;
    if (immersionSelector.textContent === 'Start AR') {
      fullScreenRenderWindow.setBackground([...background, 0]);
      fullScreenRenderWindow
        .getApiSpecificRenderWindow()
        .startXR(SESSION_IS_AR);
      immersionSelector.textContent = 'Exit AR';
    } else {
      fullScreenRenderWindow.setBackground([...background, 255]);
      fullScreenRenderWindow.getApiSpecificRenderWindow().stopXR(SESSION_IS_AR);
      immersionSelector.textContent = 'Start AR';
    }
  }
  immersionSelector.addEventListener('click', toggleAR);

  // --------------------------------------------------------------------
  // Pipeline handling
  // --------------------------------------------------------------------
  actorPoly.setMapper(mapperPoly);
  actorLine.setMapper(mapperLine);
  // 需要考虑是否添加mapperLine
  mapperPoly.setInputData(sourcePoly);
  mapperLine.setInputData(sourceLine);
  renderer.addActor(actorPoly);

  scalarBarActor.setScalarsToColors(mapperPoly.getLookupTable());

  // Manage update when lookupTable change
  const debouncedRender = debounce(renderWindow.render, 10);
  lookupTable.onModified(debouncedRender, -1);

  // First render
  renderer.resetCamera();
  renderWindow.render();

  global.pipeline[fileName] = {
    actorPoly,
    mapperPoly,
    sourcePoly,
    lookupTable,
    actorLine,
    mapperLine,
    sourceLine,
    lookupTableLine,
    renderer,
    renderWindow,
  };

  // Update stats
  fpsMonitor.update();
}

// ----------------------------------------------------------------------------

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = function onLoad(e) {
    createPipeline(file.name, reader.result);
  };
  console.log('file', file);
  reader.readAsArrayBuffer(file);
}

// ----------------------------------------------------------------------------

export function load(container, options) {
  autoInit = false;
  emptyContainer(container);

  if (options.files) {
    createViewer(container);
    let count = options.files.length;
    while (count--) {
      loadFile(options.files[count]);
    }
    updateCamera(renderer.getActiveCamera());
  } else if (options.fileURL) {
    const urls = [].concat(options.fileURL);
    const progressContainer = document.createElement('div');
    progressContainer.setAttribute('class', style.progress);
    container.appendChild(progressContainer);

    const progressCallback = (progressEvent) => {
      if (progressEvent.lengthComputable) {
        const percent = Math.floor(
          (100 * progressEvent.loaded) / progressEvent.total
        );
        progressContainer.innerHTML = `Loading ${percent}%`;
      } else {
        progressContainer.innerHTML = formatBytesToProperUnit(
          progressEvent.loaded
        );
      }
    };

    createViewer(container);
    const nbURLs = urls.length;
    let nbLoadedData = 0;

    /* eslint-disable no-loop-func */
    while (urls.length) {
      const url = urls.pop();
      const name = Array.isArray(userParams.name)
        ? userParams.name[urls.length]
        : `Data ${urls.length + 1}`;
      HttpDataAccessHelper.fetchBinary(url, {
        progressCallback,
      }).then((binary) => {
        nbLoadedData++;
        if (nbLoadedData === nbURLs) {
          container.removeChild(progressContainer);
        }
        createPipeline(name, binary);
        updateCamera(renderer.getActiveCamera());
      });
    }
  }
}

export function initLocalFileLoader(container) {
  const exampleContainer = document.querySelector('.content');
  const rootBody = document.querySelector('body');
  const myContainer = container || exampleContainer || rootBody;

  if (myContainer !== container) {
    myContainer.classList.add(style.fullScreen);
    rootBody.style.margin = '0';
    rootBody.style.padding = '0';
  } else {
    rootBody.style.margin = '0';
    rootBody.style.padding = '0';
  }

  const fileContainer = document.createElement('div');
  fileContainer.innerHTML = `<div class="${style.bigFileDrop}"/><input type="file" multiple accept=".vtp" style="display: none;"/>`;
  myContainer.appendChild(fileContainer);

  const fileInput = fileContainer.querySelector('input');

  function handleFile(e) {
    preventDefaults(e);
    const dataTransfer = e.dataTransfer;
    const files = e.target.files || dataTransfer.files;
    if (files.length > 0) {
      myContainer.removeChild(fileContainer);
      load(myContainer, { files });
    }
  }

  fileInput.addEventListener('change', handleFile);
  fileContainer.addEventListener('drop', handleFile);
  fileContainer.addEventListener('click', (e) => fileInput.click());
  fileContainer.addEventListener('dragover', preventDefaults);
}

// Look at URL an see if we should load a file
// ?fileURL=https://data.kitware.com/api/v1/item/59cdbb588d777f31ac63de08/download
if (userParams.url || userParams.fileURL) {
  const exampleContainer = document.querySelector('.content');
  const rootBody = document.querySelector('body');
  const myContainer = exampleContainer || rootBody;

  if (myContainer) {
    myContainer.classList.add(style.fullScreen);
    rootBody.style.margin = '0';
    rootBody.style.padding = '0';
  }

  load(myContainer, userParams);
}

// Auto setup if no method get called within 100ms
setTimeout(() => {
  if (autoInit) {
    initLocalFileLoader();
  }
}, 100);
