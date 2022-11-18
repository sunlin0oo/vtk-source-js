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
import vtkPolyDataReader from 'vtk.js/Sources/IO/Legacy/PolyDataReader';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPolyData from 'vtk.js/Sources/Common/DataModel/PolyData';
import { ObjectType } from 'vtk.js/Sources/Rendering/OpenGL/BufferObject/Constants';
import vtkXMLPolyDataReader from 'vtk.js/Sources/IO/XML/XMLPolyDataReader';
import HttpDataAccessHelper from 'vtk.js/Sources/IO/Core/DataAccessHelper/HttpDataAccessHelper';
import jsondata from '../../../../../Data/JSON/beam_vtp.json';
import displacementx from '../../../../../Data/JSON/displacement_x.json';
import displacementy from '../../../../../Data/JSON/displacement_y.json';
import displacementz from '../../../../../Data/JSON/displacement_z.json';


const fileName = 'sphere.vtk'; // 'uh60.vtk'; // 'luggaBody.vtk';

HttpDataAccessHelper.fetchBinary(
  `${__BASE_PATH__}/data/model/beam.vtp`
).then((binary) => {
  // ----------------Rendering----------------
  const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance();
  const renderer = fullScreenRenderer.getRenderer();
  const renderWindow = fullScreenRenderer.getRenderWindow();

  const resetCamera = renderer.resetCamera;
  const render = renderWindow.render;
  // ----------------End----------------
  const reader = vtkXMLPolyDataReader.newInstance();
  reader.parseAsArrayBuffer(binary);
  const polydata = reader.getOutputData(0);
  
  const pointValue = polydata.getPoints().get().values;
  
 
  const pointData = polydata.getPointData()
 
  
  // --------------------- 偏移处理 ---------------------
  const offsetVBO = new Float32Array(pointValue.length); // 19947
  let displacementCoorIndex = 0;
  // // ---------------------- 正式部分 ----------------------
  const pointLen = pointValue.length / 3;
  console.log('pointLen', pointLen);
  // // [0][1][2]代表坐标轴,i代表第几个顶点
  for (let i = 0; i < pointLen; i++) {
    offsetVBO[displacementCoorIndex++] = displacementx[i];
    offsetVBO[displacementCoorIndex++] = displacementy[i];
    offsetVBO[displacementCoorIndex++] = displacementz[i];
  }
  polydata.getPointData().addArray(vtkDataArray.newInstance({
    name: 'vertexOffset',
    values: offsetVBO,
    numberOfComponents:3
  }));
  console.log('pointData', pointData);
  // polydata.getPointData().setActiveVectors('vertexOffset');
  // eslint-disable-next-line prefer-const
  // polydata.getPointData().setActiveAttributeByName('vertexOffset','Vectors');
  console.log('offsetVBO', offsetVBO); // 19947
  // shader的操作是异步操作
  const mapper = vtkMapper.newInstance();
  const actor = vtkActor.newInstance();

  mapper.setInputData(polydata);
  // mapper.addInputData(offsetVBO);
  // mapper.setInputArrayToProcess(1,'vertexOffsetMC', 'PointData', 'Vectors');
  mapper.setCustomShaderAttributes(['vertexOffset']);
  actor.setMapper(mapper);
  console.log('polydata', polydata.toJSON());
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

  // --------------------------着色器替换部分--------------------------
  mapperViewProp.addShaderReplacements(
    'Vertex',
    '//VTK::PositionVC::Dec',
    true,
    '//VTK::PositionVC::Dec\n attribute vec3 vertexOffsetMC;\n',
    false
  );
  
  mapperViewProp.addShaderReplacements(
    'Vertex',
    '//VTK::PositionVC::Dec',
    true,
    '//VTK::PositionVC::Dec\nuniform float deformation;\n',
    false
  );
  
  mapperViewProp.addShaderReplacements(
    'Vertex',
    'vertexVCVSOutput = MCVCMatrix * vertexMC',
    false,
    'vertexVCVSOutput = MCVCMatrix * vec4(vertexMC.x,vertexMC.y,vertexMC.z,1.0)',
    false
  );
  

  mapperViewProp.addShaderReplacements(
    'Vertex',
    'gl_Position = MCPCMatrix * vertexMC',
    false,
    'gl_Position = MCPCMatrix * (vec4(vertexMC.x,vertexMC.y,vertexMC.z,1.0) + vec4(vertexOffsetMC.x,vertexOffsetMC.y,vertexOffsetMC.z,1.0) * deformation)\n', // 未将vertexOffsetMC传入,这里的数值参数仍是坐标值
    false
  );
  // // --------------------------着色器替换部分结束--------------------------

  // // --------------------------uniform1f添加--------------------------
  const uniform1f = 1.0;
  // 进行函数的回调===>进行参数的调用
  mapperViewProp.ShadersCallbacks = [];

  // 添加形变系数作为Uniformi属性
  mapperViewProp.ShadersCallbacks.push({
    // ShaderProgam中进行查阅==>什么情况传什么样的参数
    userData: uniform1f,
    callback(userData, cellBO, ren, _actor) {
      // console.log('cellBO', cellBO);
      const program = cellBO.getProgram();
      console.log('program', program);
      program.setUniformf('deformation', userData);
    },
  });
  // mapper.setInputArrayToProcess(0)
  // --------------------------uniform1f添加结束--------------------------
  // if (
  //   cellBO
  //     .getVAO()
  //     // Add an attribute to the VAO with the specified characteristics
  //     .addAttributeArray(
  //       cellBO.getProgram(), // shaderProgram
  //       cellBO.getCABO(), // buffer
  //       'vertexOffsetMC', // name==>INVALID_VALUE: enableVertexAttribArray: index out of range/vertexAttribPointer: index out of range==>未设置数值
  //       cellBO.getCABO().getVertexOffset(), // offset==>从数组的起点 到 该属性的起始位置的距离
  //       cellBO.getCABO().getStride(), // 连续的顶点属性组之间的间隔==>在顶点数组内 第二次出现的地方 到 第一次出现的地方 的距离
  //       model.context.FLOAT, // elementType
  //       3, // elementTupleSize
  //       false // 是否希望数据被标准化
  //     )
  //   )
  // --------------------------attribute添加--------------------------
  // 添加偏移量作为attribute属性
  // mapperViewProp.ShadersCallbacks.push({
  //   userData: offsetVBO,
  //   callback(userData, cellBO, ren, _actor, model) {
  //     // console.log('回调函数中model', model);
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
  //       gl.vertexAttribPointer(index, size, type, normalized, stride, offset);
  //       Ⅲ gl.bindBuffer(gl.ARRAY_BUFFER, null);
  //         // 解绑VAO
  //       Ⅳ gl.bindVertexArray(null)
  //      */
  //     // console.log('Custom-回调函数中model', model);
  //     const gl = model.context;
  //     cellBO.getVAO().bind();
  //     // 创建缓冲区对象
  //     model.vertexBuffer = gl.createBuffer();
  //     // console.log('Custom-model.vertexBuffer', model.vertexBuffer);
  //     // 将缓冲区对象绑定到目标
  //     gl.bindBuffer(gl.ARRAY_BUFFER, model.vertexBuffer);
  //     // console.log(userData);
  //     // 向缓冲区中写入数据
  //     gl.bufferData(gl.ARRAY_BUFFER, userData, gl.STATIC_DRAW);
  //     // ----------------- End -----------------

  //     // ----------------- 启用顶点坐标数据数组(VAO)开启attribute变量-----------------
  //     console.log('Custom-回调函数中cellBO.getCABO()', cellBO.getCABO().get());
  //     if (cellBO.getProgram().isAttributeUsed('vertexOffsetMC')) {
  //       model.handleProgram = cellBO.getProgram().getHandle();
  //       const paraIndex = gl.getAttribLocation(model.handleProgram, 'vertexOffsetMC');
  //       gl.enableVertexAttribArray(paraIndex);
  //       // 将数据传递到顶点属性中==>具体是从哪个VBO（程序中可以有多个VBO）获取则是通过在调用glVetexAttribPointer时绑定到GL_ARRAY_BUFFER的VBO决定的
  //       gl.vertexAttribPointer(1, 3, model.context.FLOAT, false, 4, 0);
  //       console.log('cellBO.getProgram().getHandle()', cellBO.getProgram().get())
  //     } else {
  //       console.log('Custom-未进行设置');
  //     }
  //   },
  // });
  // --------------------------attribute添加结束--------------------------
  // --------------------------render--------------------------
  renderer.addActor(actor);
  resetCamera();
  render();

  // --------------------------renderEnd--------------------------
});

console.log('json')

// const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance();
//   const renderer = fullScreenRenderer.getRenderer();
//   const renderWindow = fullScreenRenderer.getRenderWindow();

//   const resetCamera = renderer.resetCamera;
//   const render = renderWindow.render;

// function jsonReader(data) {
//   if (!data) return null;
//   console.log('data', data);
//   const mapper = vtkMapper.newInstance();
//   const actor = vtkActor.newInstance();
//   const len = data.edgelist.length;
//   const numdimesion = len * 6;
//   // 存储顶点维度
//   const pointValues = new Float32Array(numdimesion);
//   // 记录当前顶点维度的位置
//   let pointValuesIndex = 0;
//   // 存储Cell
//   const cellValues = new Uint32Array(len * 3);
//   // 单元偏量
//   let cellOffset = 0;
//   // 创建polydata数据集合
//   const polydata = vtkPolyData.newInstance();
//   // 读取数据
//   for (let edgeIdx = 0; edgeIdx < len; edgeIdx++) {
//     // 把所有的线段顶点放到pointValues进行存储
//     for (let i = 0; i < 6; i++) {
//       pointValues[pointValuesIndex] = data.edgelist[edgeIdx].vertex_coord[i];
//       pointValuesIndex++;
//     }
//     // 2表示一个单元包含的点的个数是2，cellOffset:表示单元所关联的点的Id
//     cellValues[cellOffset++] = 2;
//     cellValues[cellOffset++] = edgeIdx * 2 + 0;
//     cellValues[cellOffset++] = edgeIdx * 2 + 1;
//   }
//   // console.log('pointValues', pointValues);
//   // console.log('cellValues', cellValues);

//   // polydata.getCellData().setNormals(vtkDataArray.newInstance({
//   //   name: 'Normals',
//   //   values: normalValues,
//   //   numberOfComponents: 3
//   // })); // Add new output

//   polydata.getPoints().setData(pointValues, 3);
//   // 将Cell输入导入到CellArray中作为拓扑结构
//   // polydata.getPolys().setData(cellValues);
//   polydata.getLines().setData(cellValues);
//   // polydata.getVerts().setData(cellValues);
//   // actor.getProperty().setEdgeColor([1, 0, 1]);
//   // 必须要是Float32Array
//   const offsetVBO = new Float32Array(numdimesion);
//   let offsetVBOIndex = 0;
//   for (let i = 0; i < numdimesion; i++) {
//     offsetVBO[offsetVBOIndex++] = 0;
//     offsetVBO[offsetVBOIndex++] = Math.sin(i*3);
//     offsetVBO[offsetVBOIndex++] = 0;
//   }

//   // shader的操作是异步操作
//   mapper.setInputData(polydata);
//   actor.setMapper(mapper);
//   console.log('json-polydata', polydata.toJSON())
//   // ---------------------------初始化开始---------------------------
//   // 初始化==>与polydataMapper进行关联==>renderable.getViewSpecificProperties()
//   const mapperViewProp = mapper.getViewSpecificProperties(); // 对象
//   mapperViewProp.OpenGL = {
//     ShaderReplacements: [],
//   };
//   console.log('Custom-mapperViewProp.OpenGL::', mapperViewProp.OpenGL);
//   mapperViewProp.addShaderReplacements = (
//     _shaderType, // 需要编辑的shader类型
//     _originalValue, // 要替换的值
//     _replaceFirst, // true:在默认值之前完成替换，false==>反之之后完成替换
//     _replacementValue, // 替换值
//     _replaceAll // true:定义只需要替换第一次出现,false:全部替换
//   ) => {
//     mapperViewProp.OpenGL.ShaderReplacements.push({
//       shaderType: _shaderType,
//       originalValue: _originalValue,
//       replaceFirst: _replaceFirst,
//       replacementValue: _replacementValue,
//       replaceAll: _replaceAll,
//     });
//   };
//   // ---------------------------初始化结束---------------------------

//   // --------------------------uniform1f添加--------------------------
//   const uniform1f = 1.0;
//   // 进行函数的回调===>进行参数的调用
//   mapperViewProp.ShadersCallbacks = [];

//   // 添加形变系数作为Uniformi属性
//   mapperViewProp.ShadersCallbacks.push({
//     // ShaderProgam中进行查阅==>什么情况传什么样的参数
//     userData: uniform1f,
//     callback(userData, cellBO, ren, _actor) {
//       console.log('Custom-cellBO', cellBO);
//       const program = cellBO.getProgram();
//       console.log('Custom-program', program);
//       program.setUniformf('deformation', userData);
//     },
//   });
//   // --------------------------uniform1f添加结束--------------------------

//    // --------------------------着色器替换部分--------------------------
//    mapperViewProp.addShaderReplacements(
//     'Vertex',
//     '//VTK::System::Dec',
//     true,
//     '//VTK::System::Dec\n#define attribute in\n',
//     false
//   );

//   mapperViewProp.addShaderReplacements(
//     'Vertex',
//     'attribute vec4 vertexMC;',
//     true,
//     'layout(location=0) in vec4 vertexMC;\n',
//     false
//   );

  
//   mapperViewProp.addShaderReplacements(
//     'Vertex',
//     '//VTK::PositionVC::Dec',
//     true,
//     '//VTK::PositionVC::Dec\nlayout(location=1) in vec4 vertexOffsetMC;\n',
//     false
//   );
  
//   mapperViewProp.addShaderReplacements(
//     'Vertex',
//     '//VTK::PositionVC::Dec',
//     true,
//     '//VTK::PositionVC::Dec\nuniform float deformation;\n',
//     false
//   );
  
//   mapperViewProp.addShaderReplacements(
//     'Vertex',
//     'vertexVCVSOutput = MCVCMatrix * vertexMC',
//     false,
//     'vertexVCVSOutput = MCVCMatrix * vec4(vertexMC.x,vertexMC.y,vertexMC.z,1.0)',
//     false
//   );
  

//   mapperViewProp.addShaderReplacements(
//     'Vertex',
//     'gl_Position = MCPCMatrix * vertexMC',
//     false,
//     'gl_Position = MCPCMatrix * (vec4(vertexMC.x,vertexMC.y,vertexMC.z,1.0) + vec4(vertexOffsetMC.x,vertexOffsetMC.y,vertexOffsetMC.z,1.0) * deformation)\n', // 未将vertexOffsetMC传入,这里的数值参数仍是坐标值
//     false
//   );


//   // --------------------------着色器替换部分结束--------------------------


//   // --------------------------attribute添加--------------------------
//   // 添加偏移量作为attribute属性
//   mapperViewProp.ShadersCallbacks.push({
//     userData: offsetVBO,
//     callback(userData, cellBO, ren, _actor, model) {
//       console.log('Custom-回调函数中model', model);
//       /**
//        * 下面的逻辑是以一个VAO为主，去绑定两个VBO
//        * ①创建顶点VBO
//         Ⅰ this.vertexBuffer=gl.createBuffer();创建缓冲区对象（gl.createBuffer()）
//         Ⅱ gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);	绑定缓冲区对象VBO（gl.bindBuffer()）；
//         Ⅲ gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(this.vertexData),gl.STATIC_DRAW);将数据写入缓冲区（gl.bufferData()）；

//         * ②创造VAO
//         Ⅰ this.VAOArray=gl.createVertexArray();//创建VAO数组对象
//         Ⅱ gl.bindVertexArray(this.VAOArray);  //绑定VAO==>如果要切换不同的VAO，则需要在这里进行处理

//         * ③启用顶点坐标数据数组开启attribute变量
//         Ⅰ gl.enableVertexAttribArray(gl.getAttribLocation(this.program, "aPosition"));
//         //给管线指定顶点坐标数据
//         第一个参数指定我们要配置的顶点属性。还记得我们在顶点着色器中使用**layout(location = 0)**定义了position顶点属性的位置值(Location)吗？
//         它可以把顶点属性的位置值设置为0。因为我们希望把数据传递到这一个顶点属性中，所以这里我们传入0
//         Ⅱ gl.vertexAttribPointer(gl.getAttribLocation(this.program, "aPosition"), 3, gl.FLOAT, false, 0, 0);

//         * ④ 如法炮制加入另外一个attribute==>this.colorBuffer
//           //启用顶点纹理坐标数据数组
//         Ⅰ gl.enableVertexAttribArray(gl.getAttribLocation(this.program, "aTexCoor"));
//           //给管线指定顶点纹理坐标数据
//         Ⅱ gl.vertexAttribPointer(gl.getAttribLocation(this.program, "aTexCoor"), 2, gl.FLOAT, false, 0, 0);
//         Ⅲ gl.bindBuffer(gl.ARRAY_BUFFER, null);
//           // 解绑VAO
//         Ⅳ gl.bindVertexArray(null)
//        */
//       // ----------------- VBO三步骤-----------------
//       // // 解绑bindBuffer
//       // cellBO.getCABO().release();
//       // console.log('cellBO.getCABO().bind()', cellBO.getCABO().bind());
//       // 如果直接使用upload的话,数据直接附着在原来的缓冲区对象后面，根本没有创建新的VAO，是在一个VBO中进行的
//       // cellBO.getCABO().upload(userData, ObjectType.ARRAY_BUFFER); 
//       // 验证attribute是否在Shader中应用==>gl.getAttribLocation()需要在Shader中进行应用

//       const gl = model.context;
//       // 创建缓冲区对象
//       model.vertexBuffer = gl.createBuffer();
//       console.log('Custom-model.vertexBuffer', model.vertexBuffer);
//       // 将缓冲区对象绑定到目标
//       gl.bindBuffer(gl.ARRAY_BUFFER, model.vertexBuffer);
//       // console.log(userData);
//       // 向缓冲区中写入数据
//       gl.bufferData(gl.ARRAY_BUFFER, userData, gl.STATIC_DRAW);
//       // ----------------- End -----------------

//       // ----------------- 启用顶点坐标数据数组(VAO)开启attribute变量-----------------
//       console.log('Custom-回调函数中cellBO.getCABO()', cellBO.getCABO());
//       if (cellBO.getProgram().isAttributeUsed('vertexOffsetMC')) {
//         // if (
//         //   包含步骤③
//         //   cellBO
//         //     .getVAO()
//         //     // Add an attribute to the VAO with the specified characteristics
//         //     .addAttributeArray(
//         //       cellBO.getProgram(), // shaderProgram
//         //       cellBO.getCABO(), // buffer
//         //       'vertexOffsetMC', // name==>INVALID_VALUE: enableVertexAttribArray: index out of range/vertexAttribPointer: index out of range==>未设置数值
//         //       cellBO.getCABO().getVertexOffset(), // offset==>从数组的起点 到 该属性的起始位置的距离
//         //       cellBO.getCABO().getStride(), // 连续的顶点属性组之间的间隔==>在顶点数组内 第二次出现的地方 到 第一次出现的地方 的距离
//         //       model.context.FLOAT, // elementType
//         //       3, // elementTupleSize
//         //       false // 是否希望数据被标准化
//         //     )
//         //   )
//         console.log('cellBO.getVAO()', cellBO);
//         model.handleProgram = cellBO.getProgram().getHandle();
//         const paraIndex = gl.getAttribLocation(model.handleProgram, 'vertexOffsetMC');
//         gl.enableVertexAttribArray(paraIndex);
//         // 将数据传递到顶点属性中==>具体是从哪个VBO（程序中可以有多个VBO）获取则是通过在调用glVetexAttribPointer时绑定到GL_ARRAY_BUFFER的VBO决定的
//         gl.vertexAttribPointer(
//           paraIndex,
//           3,
//           model.context.FLOAT,
//           false,
//           12,
//           0
//         )
//       } else {
//         console.log('Custom-未进行设置');
//       }
//       // -----------------End-----------------
//     },
//   });
//   // --------------------------attribute添加结束--------------------------

//   // 加载数据
//   mapper.setInputData(polydata);
//   console.log("mapper:::",mapper);
//   actor.setMapper(mapper);
//   renderer.addActor(actor);
//   resetCamera();
//   render();
//   return null;
// }
// jsonReader(jsondata);
