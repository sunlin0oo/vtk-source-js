import 'vtk.js/Sources/favicon';

// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import 'vtk.js/Sources/Rendering/Profiles/Geometry';

import macro from 'vtk.js/Sources/macros';
import vtkFullScreenRenderWindow from 'vtk.js/Sources/Rendering/Misc/FullScreenRenderWindow';

import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkCalculator from 'vtk.js/Sources/Filters/General/Calculator';
import vtkDataSet from 'vtk.js/Sources/Common/DataModel/DataSet';
import vtkLookupTable from 'vtk.js/Sources/Common/Core/LookupTable';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import vtkPlaneSource from 'vtk.js/Sources/Filters/Sources/PlaneSource';
import vtkPoints from 'vtk.js/Sources/Common/Core/Points';
import vtkPolyData from 'vtk.js/Sources/Common/DataModel/PolyData';
import vtkWarpScalar from 'vtk.js/Sources/Filters/General/WarpScalar';
import jsondata from '../../../../../Data/JSON/beam_vtp.json';

import controlPanel from './controlPanel.html';

const { ColorMode, ScalarMode } = vtkMapper;
const { FieldDataTypes } = vtkDataSet;
const { vtkErrorMacro } = macro;

let formulaIdx = 0;
const FORMULA = [
  '((x[0] - 0.5) * (x[0] - 0.5)) + ((x[1] - 0.5) * (x[1] - 0.5)) + 0.125',
  '0.25 * Math.sin(Math.sqrt(((x[0] - 0.5) * (x[0] - 0.5)) + ((x[1] - 0.5) * (x[1] - 0.5)))*50)',
];

function ReadJson(data) {
  const len = data.edgelist.length;
  const numdimesion = len * 6;
  // 存储顶点维度
  const pointValues = new Float32Array(numdimesion);
  // 记录当前顶点维度的位置
  let pointValuesIndex = 0;
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
  return polydata;
}

// ----------------------------------------------------------------------------
// Standard rendering code setup
// ----------------------------------------------------------------------------

const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
  background: [0.9, 0.9, 0.9],
});
const renderer = fullScreenRenderer.getRenderer();
const renderWindow = fullScreenRenderer.getRenderWindow();
const polyData = ReadJson(jsondata);
// ----------------------------------------------------------------------------
// Example code
// ----------------------------------------------------------------------------
// 设置一个lookuptable颜色映射器
const lookupTable = vtkLookupTable.newInstance({ hueRange: [0.666, 0] });
// 平面资源的范围
const planeSource = vtkPlaneSource.newInstance({
  xResolution: 25,
  yResolution: 25,
});
// 平面的mapper设置
const planeMapper = vtkMapper.newInstance({
  interpolateScalarsBeforeMapping: true,
  colorMode: ColorMode.DEFAULT,
  scalarMode: ScalarMode.DEFAULT,
  useLookupTableScalarRange: true,
  lookupTable,
});

// 平面actor
const planeActor = vtkActor.newInstance();
planeActor.getProperty().setEdgeVisibility(true);

const simpleFilter = vtkCalculator.newInstance();

simpleFilter.setFormulaSimple(
  FieldDataTypes.POINT, // Generate an output array defined over points.
  [], // We don't request any point-data arrays because point coordinates are made available by default.
  'z', // Name the output array "z"
  (x) => (x[0] - 0.5) * (x[0] - 0.5) + (x[1] - 0.5) * (x[1] - 0.5) + 0.125
); // Our formula for z
console.log('FieldDataTypes.POINT', FieldDataTypes.POINT);
// 根据设定法向量normal和标量Scalar,移动变形点
const warpScalar = vtkWarpScalar.newInstance();
const warpMapper = vtkMapper.newInstance({
  interpolateScalarsBeforeMapping: true,
  useLookupTableScalarRange: true,
  lookupTable,
});
// 设置矢量移动坐标点
const warpActor = vtkActor.newInstance();
console.log('simpleFilter', simpleFilter);
// The generated 'z' array will become the default scalars, so the plane mapper will color by 'z':
// simpleFilter.setInputConnection(planeSource.getOutputPort());
simpleFilter.setInputData(polyData);
// We will also generate a surface whose points are displaced from the plane by 'z':
warpScalar.setInputConnection(simpleFilter.getOutputPort());
warpScalar.setInputArrayToProcess(0, 'z', 'PointData', 'Scalars');

planeMapper.setInputConnection(simpleFilter.getOutputPort());
planeActor.setMapper(planeMapper);

warpMapper.setInputData(polyData);
// warpMapper.setInputConnection(warpScalar.getOutputPort());
warpActor.setMapper(warpMapper);

renderer.addActor(planeActor);
renderer.addActor(warpActor);

renderer.resetCamera();
renderWindow.render();

// ----------------------------------------------------------------------------
// UI control handling
// ----------------------------------------------------------------------------

fullScreenRenderer.addController(controlPanel);

function updateScalarRange() {
  const min = Number(document.querySelector('.min').value);
  const max = Number(document.querySelector('.max').value);
  if (!Number.isNaN(min) && !Number.isNaN(max)) {
    lookupTable.setMappingRange(min, max);
    renderWindow.render();
  }
}

function applyFormula() {
  const el = document.querySelector('.formula');
  let fn = null;
  try {
    /* eslint-disable no-new-func */
    fn = new Function('x,y', `return ${el.value}`);
    /* eslint-enable no-new-func */
  } catch (exc) {
    if (!('name' in exc && exc.name === 'SyntaxError')) {
      vtkErrorMacro(`Unexpected exception ${exc}`);
      el.style.background = '#fbb';
      return;
    }
  }
  if (fn) {
    el.style.background = '#fff';
    const formulaObj = simpleFilter.createSimpleFormulaObject(
      FieldDataTypes.POINT,
      [],
      'z',
      fn
    );

    // See if the formula is actually valid by invoking "formulaObj" on
    // a dataset containing a single point.
    planeSource.update();
    const arraySpec = formulaObj.getArrays(planeSource.getOutputData());
    const testData = vtkPolyData.newInstance();
    const testPts = vtkPoints.newInstance({
      name: 'coords',
      numberOfComponents: 3,
      size: 3,
      values: [0, 0, 0],
    });
    testData.setPoints(testPts);
    const testOut = vtkPolyData.newInstance();
    testOut.shallowCopy(testData);
    const testArrays = simpleFilter.prepareArrays(arraySpec, testData, testOut);
    try {
      formulaObj.evaluate(testArrays.arraysIn, testArrays.arraysOut);

      // We evaluated 1 point without exception... it's safe to update the
      // filter and re-render.
      simpleFilter.setFormula(formulaObj);

      simpleFilter.update();

      // Update UI with new range
      const [min, max] = simpleFilter
        .getOutputData()
        .getPointData()
        .getScalars()
        .getRange();
      document.querySelector('.min').value = min;
      document.querySelector('.max').value = max;
      lookupTable.setMappingRange(min, max);

      renderWindow.render();
      return;
    } catch (exc) {
      vtkErrorMacro(`Unexpected exception ${exc}`);
    }
  }
  el.style.background = '#ffb';
}

['xResolution', 'yResolution'].forEach((propertyName) => {
  document.querySelector(`.${propertyName}`).addEventListener('input', (e) => {
    const value = Number(e.target.value);
    planeSource.set({ [propertyName]: value });
    renderWindow.render();
  });
});

['scaleFactor'].forEach((propertyName) => {
  document.querySelector(`.${propertyName}`).addEventListener('input', (e) => {
    const value = Number(e.target.value);
    warpScalar.set({ [propertyName]: value });
    renderWindow.render();
  });
});

// Checkbox
document.querySelector('.visibility').addEventListener('change', (e) => {
  planeActor.setVisibility(!!e.target.checked);
  renderWindow.render();
});

document.querySelector('.formula').addEventListener('input', applyFormula);

['min', 'max'].forEach((selector) => {
  document
    .querySelector(`.${selector}`)
    .addEventListener('input', updateScalarRange);
});

document.querySelector('.next').addEventListener('click', (e) => {
  formulaIdx = (formulaIdx + 1) % FORMULA.length;
  document.querySelector('.formula').value = FORMULA[formulaIdx];
  applyFormula();
  renderWindow.render();
});

// Eecompute scalar range
applyFormula();

// -----------------------------------------------------------
// Make some variables global so that you can inspect and
// modify objects in your browser's developer console:
// -----------------------------------------------------------

global.setLoggerFunction = macro.setLoggerFunction;
global.planeSource = planeSource;
global.planeMapper = planeMapper;
global.planeActor = planeActor;
global.simpleFilter = simpleFilter;
global.warpMapper = warpMapper;
global.warpActor = warpActor;
global.renderer = renderer;
global.renderWindow = renderWindow;
global.lookupTable = lookupTable;
