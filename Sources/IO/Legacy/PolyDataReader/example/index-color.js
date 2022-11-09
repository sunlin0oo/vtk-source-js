/* eslint-disable array-callback-return */
/* eslint-disable no-restricted-syntax */
/* eslint-disable prettier/prettier */
/* eslint-disable no-irregular-whitespace */
/* eslint-disable no-unused-vars */
import 'vtk.js/Sources/favicon';

// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import 'vtk.js/Sources/Rendering/Profiles/Geometry';
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkFullScreenRenderWindow from 'vtk.js/Sources/Rendering/Misc/FullScreenRenderWindow';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import vtkPolyDataReader from 'vtk.js/Sources/IO/Legacy/PolyDataReader';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPolyData from 'vtk.js/Sources/Common/DataModel/PolyData';
import { ObjectType } from 'vtk.js/Sources/Rendering/OpenGL/BufferObject/Constants';
// // 引入颜色模式，标量模式
import {
  ColorMode,
  ScalarMode,
} from 'vtk.js/Sources/Rendering/Core/Mapper/Constants';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction'
import vtkColorMaps from '../../components/ColorTransferFunction/ColorMaps/index';
import data from '../../../../../Data/JSON/beam_vtp.json';
import displacementData from '../../../../../Data/JSON/displacement.json';
import scalarsData from '../../../../../Data/JSON/BEAM-VTP.json';

console.log('scalarsData', scalarsData);

const fileName = 'sphere.vtk'; // 'uh60.vtk'; // 'luggaBody.vtk';

// ----------------------------------------------------------------------------
// Standard rendering code setup
// ----------------------------------------------------------------------------

const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance();
const renderer = fullScreenRenderer.getRenderer();
const renderWindow = fullScreenRenderer.getRenderWindow();

const resetCamera = renderer.resetCamera;
const render = renderWindow.render;

console.log('data', data);
const actor = vtkActor.newInstance();
// 设置光照
actor.getProperty().setDiffuse(1.5);
actor.getProperty().setAmbient(1);

const len = data.edgelist.length;
const numdimesion = len * 6;

// 存储顶点维度
const pointValues = new Float32Array(numdimesion);
// 记录当前顶点维度的位置
let pointValuesIndex = 0;
// 存储法向量
const normalValues = new Float32Array(len);
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

polydata.getPoints().setData(pointValues, 3);
// 将Cell输入导入到CellArray中作为拓扑结构
polydata.getLines().setData(cellValues);
console.log('polydata.getPoints()', polydata.getPoints().get()); // 获取顶点相关信息
// console.log('polydata.getPolys()', polydata.getPolys().get()); // 获取拓扑结构的数值

// ---------------------------设置Scalars---------------------------
// 这样设置才会与lookuptable进行相互的关联
const preset = vtkColorMaps.getPresetByName('Turbo');
// console.log('preset', preset);
// console.log('preset.RGBPoints', preset.RGBPoints);
// // 这里要考虑到数组的格式设置
// Float32Array 显示的颜色不一致
const scalarArray = new Float32Array(
  scalarsData.pointData.arrays[0].data.values,
  scalarsData.pointData.arrays[1].data.values,
  scalarsData.pointData.arrays[2].data.values);
// // preset.RGBPoints将20的颜色的过渡==>256的RGB转到0-1，以4个一组为单位：pointIndex/r/g/b
const table = vtkDataArray.newInstance({
  name: 'color',
  values: scalarArray,
  numberOfComponents: 1
});
// // 载入每个顶点的标量值--设置点集标量
polydata.getPointData().setScalars(table);
// 载入每个顶点的标量值--设置点集标量
// polydata.getPointData().setScalars(vtkDataArray.newInstance({
//   name: 'color',
//   values: scalarArray
// }));
// ---------------------------END---------------------------

// 
// 颜色查找表
const lookupTable = vtkColorTransferFunction.newInstance();
// 创建映射器
const mapper = vtkMapper.newInstance({
  interpolateScalarsBeforeMapping: false,
  useLookupTableScalarRange: true,
  lookupTable,
  scalarVisibility: false,
});
mapper.set({
  colorByArrayName: "color",
  interpolateScalarsBeforeMapping: true,
  colorMode: ColorMode.MAP_SCALARS,
  // colorMode: 1,
  // scalarMode: 1,// 总是使用点标量属性数据进行映射的
  scalarMode: ScalarMode.USE_POINT_DATA,// 总是使用点标量属性数据进行映射的
  // scalarMode: ScalarMode.USE_CELL_DATA,// 总是使用单元标量属性数据进行映射的
  // scalarMode: ScalarMode.USE_POINT_FIELD_DATA, // 利用点属性数据中的数据数组。而不是点标量数据和单元标量数据
  // scalarMode: ScalarMode.USE_CELL_FIELD_DATA, //利用单元属性数据中得场数据。而不是点或者单元标量数据
  // scalarMode: ScalarMode.USE_POINT_DUSE_FIELD_DATAATA,
  scalarVisibility: true,// 设置是否进行标量渲染
});

// 设置颜色表中的颜色
lookupTable.applyColorMap(preset);
// 颜色映射的范围值
lookupTable.setMappingRange(-0.000118605, 0.000115021);
// 更新颜色映射的范围值
lookupTable.updateRange();
// ---------------------------设置形变数据开始---------------------------
// 必须要是Float32Array
// const offsetVBO = new Float32Array(numdimesion);
// let offsetVBOIndex = 0;
// Object.values(displacementData).map((value) => {
//   offsetVBO[offsetVBOIndex] = value * 50.0;
//   offsetVBOIndex++;
// })
// for (let i = 0; i < numdimesion; i++) {
//   offsetVBO[i] = 0.0;
// }
// console.log(offsetVBO)
// ---------------------------设置形变数据结束---------------------------

// shader的操作是异步操作

// ---------------------------初始化开始---------------------------
// 初始化==>与polydataMapper进行关联==>renderable.getViewSpecificProperties()
// const mapperViewProp = mapper.getViewSpecificProperties(); // 对象
// mapperViewProp.OpenGL = {
//   ShaderReplacements: [],
// };
// // console.log('mapperViewProp.OpenGL::', mapperViewProp.OpenGL);
// mapperViewProp.addShaderReplacements = (
//   _shaderType, // 需要编辑的shader类型
//   _originalValue, // 要替换的值
//   _replaceFirst, // true:在默认值之前完成替换，false==>反之之后完成替换
//   _replacementValue, // 替换值
//   _replaceAll // true:定义只需要替换第一次出现,false:全部替换
// ) => {
//   mapperViewProp.OpenGL.ShaderReplacements.push({
//     shaderType: _shaderType,
//     originalValue: _originalValue,
//     replaceFirst: _replaceFirst,
//     replacementValue: _replacementValue,
//     replaceAll: _replaceAll,
//   });
// };
// // ---------------------------初始化结束---------------------------

// // --------------------------uniform1f添加--------------------------
// const uniform1f = 1.0;
// // 进行函数的回调===>进行参数的调用
// mapperViewProp.ShadersCallbacks = [];

// // 添加形变系数作为Uniformi属性
// mapperViewProp.ShadersCallbacks.push({
//   // ShaderProgam中进行查阅==>什么情况传什么样的参数
//   userData: uniform1f,
//   callback(userData, cellBO, ren, _actor) {
//     // console.log('cellBO', cellBO);
//     const program = cellBO.getProgram();
//     // console.log('program', program);
//     program.setUniformf('deformation', userData);
//   },
// });
// // --------------------------uniform1f添加结束--------------------------

// // --------------------------着色器替换部分--------------------------
// mapperViewProp.addShaderReplacements(
//   'Vertex',
//   '//VTK::PositionVC::Dec',
//   true,
//   '//VTK::PositionVC::Dec\nuniform float deformation;\n',
//   false
// );

// mapperViewProp.addShaderReplacements(
//   'Vertex',
//   '//VTK::PositionVC::Dec',
//   true,
//   // '//VTK::PositionVC::Dec\nlayout(location = 1) in vec4 vertexOffsetMC;\n',
//   '//VTK::PositionVC::Dec\nattribute vec4 vertexOffsetMC;\n',
//   false
// );

// mapperViewProp.addShaderReplacements(
//   'Vertex',
//   '//VTK::PositionVC::Impl', // Implementation of shader code for handling normals  用于处理法线着色器的实现==>调用变量用这个
//   true,
//   '//VTK::PositionVC::Impl\n  gl_Position = MCPCMatrix * (vertexMC + vertexOffsetMC * deformation) ;\n', // 未将vertexOffsetMC传入,这里的数值参数仍是坐标值
//   false
// );
// // --------------------------着色器替换部分结束--------------------------


// // --------------------------attribute添加--------------------------
// // 添加偏移量作为attribute属性
// mapperViewProp.ShadersCallbacks.push({
//   userData: offsetVBO,
//   callback(userData, cellBO, ren, _actor, model) {
//     console.log('回调函数中model', model);
//     /**
//      * 下面的逻辑是以一个VAO为主，去绑定两个VBO
//      * ①创建顶点VBO
//       Ⅰ this.vertexBuffer=gl.createBuffer();创建缓冲区对象（gl.createBuffer()）
//       Ⅱ gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);	绑定缓冲区对象VBO（gl.bindBuffer()）；
//       Ⅲ gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(this.vertexData),gl.STATIC_DRAW);将数据写入缓冲区（gl.bufferData()）；

//       * ②创造VAO
//       Ⅰ this.VAOArray=gl.createVertexArray();//创建VAO数组对象
//       Ⅱ gl.bindVertexArray(this.VAOArray);  //绑定VAO==>如果要切换不同的VAO，则需要在这里进行处理

//       * ③启用顶点坐标数据数组开启attribute变量
//       Ⅰ gl.enableVertexAttribArray(gl.getAttribLocation(this.program, "aPosition"));
//       //给管线指定顶点坐标数据
//       第一个参数指定我们要配置的顶点属性。还记得我们在顶点着色器中使用**layout(location = 0)**定义了position顶点属性的位置值(Location)吗？
//       它可以把顶点属性的位置值设置为0。因为我们希望把数据传递到这一个顶点属性中，所以这里我们传入0
//       Ⅱ gl.vertexAttribPointer(gl.getAttribLocation(this.program, "aPosition"), 3, gl.FLOAT, false, 0, 0);

//       * ④ 如法炮制加入另外一个attribute==>this.colorBuffer
//         //启用顶点纹理坐标数据数组
//       Ⅰ gl.enableVertexAttribArray(gl.getAttribLocation(this.program, "aTexCoor"));
//         //给管线指定顶点纹理坐标数据
//       Ⅱ gl.vertexAttribPointer(gl.getAttribLocation(this.program, "aTexCoor"), 2, gl.FLOAT, false, 0, 0);
//       Ⅲ gl.bindBuffer(gl.ARRAY_BUFFER, null);
//         // 解绑VAO
//       Ⅳ gl.bindVertexArray(null)
//      */
//     // ----------------- VBO三步骤-----------------
//     // // 解绑bindBuffer
//     // cellBO.getCABO().release();
//     // console.log('cellBO.getCABO().bind()', cellBO.getCABO().bind());
//     // 如果直接使用upload的话,数据直接附着在原来的缓冲区对象后面，根本没有创建新的VAO，是在一个VBO中进行的
//     // cellBO.getCABO().upload(userData, ObjectType.ARRAY_BUFFER); 
//     // 验证attribute是否在Shader中应用==>gl.getAttribLocation()需要在Shader中进行应用

//     const gl = model.context;
//     // 创建缓冲区对象
//     model.vertexBuffer = gl.createBuffer();
//     console.log('model.vertexBuffer', model.vertexBuffer);
//     // 将缓冲区对象绑定到目标
//     gl.bindBuffer(gl.ARRAY_BUFFER, model.vertexBuffer);
//     // console.log(userData);
//     // 向缓冲区中写入数据
//     gl.bufferData(gl.ARRAY_BUFFER, userData, gl.STATIC_DRAW);
//     // ----------------- End -----------------

//     // ----------------- 启用顶点坐标数据数组(VAO)开启attribute变量-----------------
//     console.log('回调函数中cellBO.getCABO()', cellBO.getCABO());
//     if (cellBO.getProgram().isAttributeUsed('vertexOffsetMC')) {
//       // if (
//       // 包含步骤③
//       // cellBO
//       //   .getVAO()
//       //   // Add an attribute to the VAO with the specified characteristics
//       //   .addAttributeArray(
//       //     cellBO.getProgram(), // shaderProgram
//       //     cellBO.getCABO(), // buffer
//       //     'vertexOffsetMC', // name==>INVALID_VALUE: enableVertexAttribArray: index out of range/vertexAttribPointer: index out of range==>未设置数值
//       //     cellBO.getCABO().getVertexOffset(), // offset==>从数组的起点 到 该属性的起始位置的距离
//       //     cellBO.getCABO().getStride(), // 连续的顶点属性组之间的间隔==>在顶点数组内 第二次出现的地方 到 第一次出现的地方 的距离
//       //     model.context.FLOAT, // elementType
//       //     3, // elementTupleSize
//       //     false // 是否希望数据被标准化
//       //   )
//       // )
//       model.handleProgram = cellBO.getProgram().getHandle();
//       const paraIndex = gl.getAttribLocation(model.handleProgram, 'vertexOffsetMC');
//       gl.enableVertexAttribArray(paraIndex);
//       // 将数据传递到顶点属性中==>具体是从哪个VBO（程序中可以有多个VBO）获取则是通过在调用glVetexAttribPointer时绑定到GL_ARRAY_BUFFER的VBO决定的
//       gl.vertexAttribPointer(
//         paraIndex,
//         3,
//         model.context.FLOAT,
//         false,
//         12,
//         0
//       )
//     } else {
//       console.log('未进行设置');
//     }
//     // -----------------End-----------------


//   },
// });
// --------------------------attribute添加结束--------------------------

// 加载数据

mapper.setInputData(polydata);
actor.setMapper(mapper);
renderer.addActor(actor);
resetCamera();
render();