/* eslint-disable no-unused-vars */
import 'vtk.js/Sources/favicon';

// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import 'vtk.js/Sources/Rendering/Profiles/Geometry';
import vtkPolyData from 'vtk.js/Sources/Common/DataModel/PolyData';
import vtkFullScreenRenderWindow from 'vtk.js/Sources/Rendering/Misc/FullScreenRenderWindow';
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkColorMaps from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction/ColorMaps';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import vtkTexture from 'vtk.js/Sources/Rendering/Core/Texture';
import vtkRTAnalyticSource from 'vtk.js/Sources/Filters/Sources/RTAnalyticSource';
import vtkImageSliceFilter from 'vtk.js/Sources/Filters/General/ImageSliceFilter';
import vtkScalarToRGBA from 'vtk.js/Sources/Filters/General/ScalarToRGBA';
import vtkPlaneSource from 'vtk.js/Sources/Filters/Sources/PlaneSource';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import jsondata from '../../../../../Data/JSON/beam_vtp.json';

import controller from './controller.html';

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
// Standard rendering code setup
// ----------------------------------------------------------------------------

const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
  background: [0.5, 0.5, 0.5],
});
const renderer = fullScreenRenderer.getRenderer();
const renderWindow = fullScreenRenderer.getRenderWindow();

const dataRange = [45, 183];

// ----------------------------------------------------------------------------
// Example code
// ----------------------------------------------------------------------------
const actor = vtkActor.newInstance();
const mapper = vtkMapper.newInstance();

const lookupTable = vtkColorTransferFunction.newInstance();
const preset = vtkColorMaps.getPresetByName('erdc_rainbow_bright');
lookupTable.applyColorMap(preset);
lookupTable.setMappingRange(...dataRange);
lookupTable.updateRange();

const piecewiseFunction = vtkPiecewiseFunction.newInstance();
piecewiseFunction.removeAllPoints();
piecewiseFunction.addPoint(dataRange[0], 0);
piecewiseFunction.addPoint((dataRange[0] + dataRange[1]) * 0.5, 0.1);
piecewiseFunction.addPoint(dataRange[1], 1);

const wavelet = vtkRTAnalyticSource.newInstance();

const sliceFilter = vtkImageSliceFilter.newInstance({ sliceIndex: 10 });
sliceFilter.setInputConnection(wavelet.getOutputPort());

const rgbaFilter = vtkScalarToRGBA.newInstance();
rgbaFilter.setLookupTable(lookupTable);
rgbaFilter.setPiecewiseFunction(piecewiseFunction);
rgbaFilter.setInputConnection(sliceFilter.getOutputPort());

const texture = vtkTexture.newInstance();
texture.setInputConnection(rgbaFilter.getOutputPort());

// const planeSource = vtkPlaneSource.newInstance();
// mapper.setInputConnection(planeSource.getOutputPort());
const polylSource = ReadJson(jsondata);
mapper.setInputData(polylSource);
actor.setMapper(mapper);
actor.addTexture(texture);

renderer.addActor(actor);
renderer.resetCamera();
renderWindow.render();

// UI slider
fullScreenRenderer.addController(controller);
document.querySelector('.sliceIndex').addEventListener('input', (e) => {
  const sliceIndex = Number(e.target.value);
  sliceFilter.setSliceIndex(sliceIndex);
  texture.modified();
  renderWindow.render();
});
