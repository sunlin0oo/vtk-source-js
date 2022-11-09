/* eslint-disable no-unused-vars */
/* eslint-disable camelcase */
/* eslint-disable no-irregular-whitespace */
import 'vtk.js/Sources/favicon';
// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import 'vtk.js/Sources/Rendering/Profiles/Geometry';
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkFullScreenRenderWindow from 'vtk.js/Sources/Rendering/Misc/FullScreenRenderWindow';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkTriangle from 'vtk.js/Sources/Common/DataModel/Triangle';
import vtkPolyData from 'vtk.js/Sources/Common/DataModel/PolyData';
import vtkOpenGLPolyDataMapper from 'vtk.js/Sources/Rendering/OpenGL/PolyDataMapper';
import vtkOBJReader from 'vtk.js/Sources/IO/Misc/OBJReader';
import vtkSTLReader from 'vtk.js/Sources/IO/Geometry/STLReader';
import vtkPolyDataReader from 'vtk.js/Sources/IO/Legacy/PolyDataReader';
// import INPUT_PATH from '../../../Data/model/space-shuttle-orbiter/space-shuttle-orbiter.obj';
import jsonData from '../../../Data/JSON/3M-10268-6212PC.json';
// import vtkOpenGLPolyDataMapper from 'vtk.js/Sources/Rendering/OpenGL/PolyDataMapper';
const fileName = 'sphere.vtk'; // 'uh60.vtk'; // 'luggaBody.vtk';
const __BASE_PATH__ = '../../..';
// 计算法向量
function getNormal(x1, y1, z1, x2, y2, z2, x3, y3, z3) {
  const v1 = [x1, y1, z1];
  const v2 = [x2, y2, z2];
  const v3 = [x3, y3, z3];
  const triNormal = [];
  vtkTriangle.computeNormal(v1, v2, v3, triNormal);
  return triNormal;
}

// 获取Polydata数据
function BuildPolydata(jsondata) {
  console.log(jsonData);
  if (!jsondata) {
    return;
  }
  // json数据导入Polydata中
  // 获取到面总数量
  const faceLength = jsondata.face_list.length;

  // 获取到三角面总数量
  let numTriangles = 0; // numTriangles === nbFaces
  let numdimesion = 0;
  for (let i = 0; i < faceLength; i++) {
    numTriangles += jsondata.face_list[i].number_of_triangles;
    numdimesion += jsondata.face_list[i].vertex_coord.length;
  }
  // console.log("numTriangles",numTriangles);

  // 记录三角形的个数==>用于存储数组位数
  let allTriIndex = 0;
  // 存储顶点维度
  const pointValues = new Float32Array(numdimesion);
  // 存储法向量
  const normalValues = new Float32Array(numTriangles * 3);
  // 存储Cell 对应C++中trangles
  const cellValues = new Uint32Array(numTriangles * 4);
  const cellDataValues = new Uint16Array(numTriangles);
  let cellOffset = 0;
  // 记录之前所有面的顶点数量
  let last_vertex_coord = 0;
  // 记录当前顶点维度的位置
  let pointValuesIndex = 0;
  // 读取数据
  // 创建polydata数据集合
  const polydata = vtkPolyData.newInstance();
  for (let faceIdx = 0; faceIdx < faceLength; faceIdx++) {
    // 记录每个面所含有的三角形
    const triOfFaceLength = jsondata.face_list[faceIdx].number_of_triangles;
    // points.setNumberOfPoints(triOfFaceLength*3);
    const vertexLength = jsondata.face_list[faceIdx].vertex_coord.length;
    for (let i = 0; i < vertexLength; i++) {
      pointValues[pointValuesIndex] =
        jsondata.face_list[faceIdx].vertex_coord[i];
      pointValuesIndex++;
    }
    for (let triIndex = 0; triIndex < triOfFaceLength; triIndex++) {
      //  获取三角形顶点0, 1, 2
      const tri_vertex_index_0 =
        jsondata.face_list[faceIdx].tri_vertex_index[0 + triIndex * 3];
      const tri_vertex_index_1 =
        jsondata.face_list[faceIdx].tri_vertex_index[1 + triIndex * 3];
      const tri_vertex_index_2 =
        jsondata.face_list[faceIdx].tri_vertex_index[2 + triIndex * 3];
      // 计算三角面的面法向量
      const normalValue = getNormal(
        jsondata.face_list[faceIdx].vertex_coord[tri_vertex_index_0 * 3 + 0],
        jsondata.face_list[faceIdx].vertex_coord[tri_vertex_index_0 * 3 + 1],
        jsondata.face_list[faceIdx].vertex_coord[tri_vertex_index_0 * 3 + 2],
        jsondata.face_list[faceIdx].vertex_coord[tri_vertex_index_1 * 3 + 0],
        jsondata.face_list[faceIdx].vertex_coord[tri_vertex_index_1 * 3 + 1],
        jsondata.face_list[faceIdx].vertex_coord[tri_vertex_index_1 * 3 + 2],
        jsondata.face_list[faceIdx].vertex_coord[tri_vertex_index_2 * 3 + 0],
        jsondata.face_list[faceIdx].vertex_coord[tri_vertex_index_2 * 3 + 1],
        jsondata.face_list[faceIdx].vertex_coord[tri_vertex_index_2 * 3 + 2]
      );
      normalValues[allTriIndex * 3 + 0] = normalValue[0];
      normalValues[allTriIndex * 3 + 1] = normalValue[1];
      normalValues[allTriIndex * 3 + 2] = normalValue[2];
      // 3表示一个单元包含的点的个数，id?表示单元所关联的点的Id
      cellValues[cellOffset++] = 3;
      cellValues[cellOffset++] =
        last_vertex_coord +
        jsondata.face_list[faceIdx].tri_vertex_index[triIndex * 3 + 0];
      cellValues[cellOffset++] =
        last_vertex_coord +
        jsondata.face_list[faceIdx].tri_vertex_index[triIndex * 3 + 1];
      cellValues[cellOffset++] =
        last_vertex_coord +
        jsondata.face_list[faceIdx].tri_vertex_index[triIndex * 3 + 2];
      cellDataValues[allTriIndex] = 0;
      allTriIndex++;
    }
    last_vertex_coord += jsondata.face_list[faceIdx].vertex_coord.length / 3;
  }
  // console.log("polydata::",polydata);

  // Rotate points
  // console.log("JOSN-numTriangles:::",numTriangles);
  // console.log("JOSN-pointValues:::",pointValues);
  // console.log("JOSN-normalValues:::",normalValues);
  // console.log("JOSN-cellValues:::",cellValues);
  // console.log("JOSN-cellDataValues:::",cellDataValues);

  // 这样可以将数据进行导入
  // 将顶点数组全部导入，3个为一组，作为几何结构
  polydata.getPoints().setData(pointValues, 3);
  // 将Cell输入导入到CellArray中作为拓扑结构
  polydata.getPolys().setData(cellValues);
  // polydata.getLines().setData(cellValues);
  // polydata.getVerts().setData(cellValues);

  polydata.getCellData().setNormals(
    vtkDataArray.newInstance({
      name: 'Normals',
      values: normalValues,
      numberOfComponents: 3,
    })
  ); // Add new output
  // eslint-disable-next-line consistent-return
  return polydata;
}

// ----------------------------------------------------------------------------
// Standard rendering code setup
// ----------------------------------------------------------------------------

// 渲染没有问题
// Standard rendering code setup
const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance();
const renderer = fullScreenRenderer.getRenderer();
const renderWindow = fullScreenRenderer.getRenderWindow();
const resetCamera = renderer.resetCamera;
const render = renderWindow.render;

// ----------------------------------------------------------------------------
// Test code
// ----------------------------------------------------------------------------
// 模型的选择
const jsonPolydata = BuildPolydata(jsonData);
// const readerStl = vtkSTLReader.newInstance({ splitMode: 'usemtl' });
// readerStl.setUrl(`${INPUT_PATH}`);

// const readerObj = vtkOBJReader.newInstance({ splitMode: 'usemtl' });
// readerObj.setUrl(`${INPUT_PATH}`);

const readerVtk = vtkPolyDataReader.newInstance();
readerVtk.setUrl(`/Data/legacy/${fileName}`);
console.log(`/Data/legacy/${fileName}`);
const vtkPolydata = readerVtk.getOutputData(0);
console.log(vtkPolyData);
const mapper = vtkMapper.newInstance();
// const ShaderProgram = vtkShaderProgram.newInstance();

console.log('mapper::', mapper);
const openGLPolyDataMapper = vtkOpenGLPolyDataMapper.newInstance();
console.log('openGLPolyDataMapper::', openGLPolyDataMapper);

// mapper.setInputConnection(readerStl.getOutputPort());  
// mapper.setInputConnection(readerObj.getOutputPort());
// mapper.setInputData(jsonPolydata);
mapper.setInputData(vtkPolydata);

//  Here how to initialize viewSpecificProperties to be usable in PolyDataMapper.
const mapperViewProp = mapper.getViewSpecificProperties();
mapperViewProp.ShaderCallbacks = [];
mapperViewProp.ShaderCallbacks.push({
  userdata: '',
  callback(userdata, cellBO, ren, actor) {
    const program = cellBO.getProgram();
    program.setUniformi();
  },
});

mapperViewProp.OpenGL = {
  ShaderReplacements: [],
};
console.log('mapperViewProp.OpenGL::', mapperViewProp.OpenGL);
// mapperViewProp.addShaderReplacements 箭头函数
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
console.log('mapperViewProp::', mapperViewProp);

// Actor处理部分
const actor = vtkActor.newInstance();
actor.setMapper(mapper);
// actor.getProperty().setAmbientColor(0.2, 0.2, 1.0);
// actor.getProperty().setDiffuseColor(1.0, 0.65, 0.7);
// actor.getProperty().setSpecular(0.5);
// actor.getProperty().setSpecularColor(1.0, 1.0, 1.0);
actor.getProperty().setDiffuse(0.7);
// actor.getProperty().setAmbient(0.5);
// actor.getProperty().setSpecularPower(20.0);
// actor.getProperty().setOpacity(1.0);
/**
 * MC  - Model Coordinates==>本地坐标
 * WC  - WC World Coordinates==>世界坐标
 * VC  - View Coordinates==>观察者坐标
 * DC  - Display Coordinates==>展示坐标
 * NVC - NormalizedViewCoordinates
 */
// 左右两侧的操作数格式要相同
// const MyNewVertexShaderCode =
// '# version 300 es \n'+
// 'in vec3 vertexMC;\n'+ // 位置变量的属性位置值为0
// 'out vec4 vertexColor;\n'+ // 为片段着色器指定一个颜色输出
// 'void main()\n'+
// '{\n'+
//     'gl_Position = vec4(vertexMC, 1.0);\n'+ // 注意我们如何把一个vec3作为vec4的构造器的参数
//     'vertexColor = vec4(0.5, 0.0, 0.0, 1.0);\n'+ // 把输出变量设置为暗红色==>设置顶点颜色
// '}\n'
// //  通过此代码可以直接对着色器进行编写
// mapperViewProp.OpenGL.VertexShaderCode = MyNewVertexShaderCode;
// const MyNewFragmentShaderCode =
// '# version 300 es \n'+
// // 需要声明片元着色器的精度
// 'precision lowp float;\n'+
// 'out vec4 FragColor;\n'+
// 'in vec4 vertexColor;\n'+ // 从顶点着色器传来的输入变量（名称相同、类型相同）
// 'void main()\n'+
// '{\n'+
//     'FragColor = vertexColor;\n'+
// '}'
// mapperViewProp.OpenGL.FragmentShaderCode = MyNewFragmentShaderCode;

/** 所有顶点着色器都应使用 VSOutput 后​​缀命名其输出
 * 所有几何着色器应使用 GSOutput 后​​缀命名其输出
 * 所有片段着色器应使用 VSOutput 后​​缀命名其输入。
 * 换句话说，片段着色器应该假设它们的输入来自顶点着色器。 */

// 如果要进行替换 则对其对应的标签及内容进行处理

mapperViewProp.addShaderReplacements(
  'Vertex', // 要替换的着色器
  '//not replace', // 要替换的代码块
  true,
  '//replace\n varying vec3 myNormalMCVSOutput;\n', // 替换后的代码块
  false
);
mapperViewProp.addShaderReplacements(
  'Vertex',
  '//VTK::Normal::Dec', // declaration any uniforms/varying needed for normals   声明法线所需要的uniforms/varying==>定义用这个
  true,
  '//VTK::Normal::Dec\n  varying vec3 myNormalMCVSOutput;\n', // 标准模型坐标
  false
);

mapperViewProp.addShaderReplacements(
  'Vertex',
  '//VTK::Normal::Impl', // Implementation of shader code for handling normals  用于处理法线着色器的实现==>调用变量用这个
  true,
  '//VTK::Normal::Impl\n  myNormalMCVSOutput = normalMC;\n',
  false
);

// 顶点着色器将myNormalMCVSOutput ==> 片元着色器

// All fragment shaders should name their inputs with a postfix of VSOutput.
mapperViewProp.addShaderReplacements(
  'Fragment',
  '//VTK::Normal::Dec',
  true,
  '//VTK::Normal::Dec\n  varying vec3 myNormalMCVSOutput;\n',
  false
);

mapperViewProp.addShaderReplacements(
  'Fragment',
  '//VTK::Normal::Impl',
  true,
  '//VTK::Normal::Impl\n  diffuseColor = abs(myNormalMCVSOutput) / diffuse;\n',
  false
);
// console.log('mapperViewProp.OpenGL.VertexShaderCode', mapperViewProp.OpenGL.VertexShaderCode);

renderer.addActor(actor);
resetCamera();
render();
