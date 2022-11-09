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
import vtkBufferObject from 'vtk.js/Sources/Rendering/OpenGL/BufferObject';
import { ObjectType } from 'vtk.js/Sources/Rendering/OpenGL/BufferObject/Constants';
import { off } from 'process';

// import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
// import vtkShaderProgram from 'vtk.js/Sources/Rendering/OpenGL/ShaderProgram';
// import vtkShader from 'vtk.js/Sources/Rendering/OpenGL/Shader';
// import vtkShaderCache from 'vtk.js/Sources/Rendering/OpenGL/ShaderCache';
// import vtkOpenGLHelper from 'vtk.js/Sources/Rendering/OpenGL/OpenGLHelper';
// // 引入颜色模式，标量模式
// import {
//   ColorMode,
//   ScalarMode,
// } from 'vtk.js/Sources/Rendering/Core/Mapper/Constants';
// import vtkColorMaps from '../components/ColorTransferFunction/ColorMaps/index';
// import jsondata from '../../../../../Data/json/beam.json';

const fileName = 'sphere.vtk'; // 'uh60.vtk'; // 'luggaBody.vtk';

// ----------------------------------------------------------------------------
// Standard rendering code setup
// ----------------------------------------------------------------------------

const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance();
const renderer = fullScreenRenderer.getRenderer();
const renderWindow = fullScreenRenderer.getRenderWindow();

const resetCamera = renderer.resetCamera;
const render = renderWindow.render;

const reader = vtkPolyDataReader.newInstance();
reader.setUrl(`${__BASE_PATH__}/data/legacy/${fileName}`).then(() => {
  // https://zhuanlan.zhihu.com/p/273522056
  // 这里之所以能读 是因为官方vtk的DataSet是  POLYDATA  而咱们的是UNSTRUCTURED_GRID
  const polydata = reader.getOutputData(0);
  const normalName = polydata.getPointData().getArrays()[0].getName();
  // 这样获取到的是Normals
  // console.log(
  //   'polydata.getPointData().getArrays()',
  //   polydata.getPointData().getArrayByName(normalName).getData()
  // ); // 获取顶点
  // const cellName = polydata.getCellData().getArrays();  //空
  // console.log(
  //   'polydata.getPointData().cellName',
  //   polydata.getPointData().getArrayByName(cellName).getData()
  // ); // 获取顶点
  const len = polydata.getPoints().get().values.length;
  const offsetVBO = [];
  let i = 0;
  while (i < len) {
    offsetVBO.push(Math.random());
    i++;
  }
  // console.log('polydata.getPoints()', polydata.getPoints().get()); // 获取顶点相关信息
  // console.log('polydata.getPolys()', polydata.getPolys().get()); // 获取拓扑结构的数值
  // shader的操作是异步操作
  const mapper = vtkMapper.newInstance();
  const actor = vtkActor.newInstance();
  mapper.setInputData(polydata);
  actor.setMapper(mapper);
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
  const uniform1f = 2.0;
  // 进行函数的回调===>进行参数的调用
  mapperViewProp.ShadersCallbacks = [];
  mapperViewProp.addShaderReplacements(
    'Vertex',
    '//VTK::PositionVC::Dec',
    true,
    '//VTK::PositionVC::Dec\nattribute vec4 vertexOffsetMC;\n',
    false
  );
  // 添加形变系数作为Uniformi属性
  mapperViewProp.ShadersCallbacks.push({
    // ShaderProgam中进行查阅==>什么情况传什么样的参数
    userData: uniform1f,
    callback(userData, cellBO, ren, _actor) {
      // console.log('cellBO', cellBO);
      const program = cellBO.getProgram();
      // console.log('program', program);
      program.setUniformf('deformation', userData);
    },
  });

  mapperViewProp.addShaderReplacements(
    'Vertex',
    '//VTK::PositionVC::Dec',
    true,
    '//VTK::PositionVC::Dec\nuniform float deformation;\n',
    false
  );

  mapperViewProp.addShaderReplacements(
    'Vertex',
    '//VTK::Normal::Dec', // declaration any uniforms/varying needed for normals   声明法线所需要的uniforms/varying==>定义用这个
    true,
    '//VTK::Normal::Dec\nvarying vec3 myNormalMCVSOutput;\n', // 标准模型坐标
    false
  );

  mapperViewProp.addShaderReplacements(
    'Vertex',
    '//VTK::Normal::Impl', // Implementation of shader code for handling normals  用于处理法线着色器的实现==>调用变量用这个
    true,
    '//VTK::Normal::Impl\n  myNormalMCVSOutput = normalMC * deformation;\n',
    false
  );

  mapperViewProp.addShaderReplacements(
    'Vertex',
    '//VTK::PositionVC::Impl', // Implementation of shader code for handling normals  用于处理法线着色器的实现==>调用变量用这个
    true,
    '//VTK::PositionVC::Impl\n  gl_Position = vertexOffsetMC  ;\n', // 未将vertexOffsetMC传入,这里的数值参数仍是坐标值
    false
  );

  // All fragment shaders should name their inputs with a postfix of VSOutput.
  mapperViewProp.addShaderReplacements(
    'Fragment',
    '//VTK::Normal::Dec',
    true,
    '//VTK::Normal::Dec\nvarying vec3 myNormalMCVSOutput;\n',
    false
  );

  mapperViewProp.addShaderReplacements(
    'Fragment',
    '//VTK::Normal::Impl',
    true,
    '//VTK::Normal::Impl\n  diffuseColor = abs(myNormalMCVSOutput) / diffuse;\n',
    false
  );
  // 添加偏移量作为attribute属性
  mapperViewProp.ShadersCallbacks.push({
    userData: offsetVBO,
    callback(userData, cellBO, ren, _actor, model) {
      console.log('回调函数中model', model);
      /**
       * 下面的逻辑是以一个VAO为主，去绑定两个VBO
       * ①创建顶点VBO
        Ⅰ this.vertexBuffer=gl.createBuffer();创建缓冲区对象（gl.createBuffer()） 
        Ⅱ gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);	绑定缓冲区对象VBO（gl.bindBuffer()）；
        Ⅲ gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(this.vertexData),gl.STATIC_DRAW);将数据写入缓冲区（gl.bufferData()）；
       
        * ②创造VAO
        Ⅰ this.VAOArray=gl.createVertexArray();//创建VAO数组对象
        Ⅱ gl.bindVertexArray(this.VAOArray);  //绑定VAO==>如果要切换不同的VAO，则需要在这里进行处理
       
        * ③启用顶点坐标数据数组开启attribute变量
        Ⅰ gl.enableVertexAttribArray(gl.getAttribLocation(this.program, "aPosition"));
        //绑定顶点坐标数据缓冲
        Ⅱ gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        //给管线指定顶点坐标数据
        第一个参数指定我们要配置的顶点属性。还记得我们在顶点着色器中使用**layout(location = 0)**定义了position顶点属性的位置值(Location)吗？
        它可以把顶点属性的位置值设置为0。因为我们希望把数据传递到这一个顶点属性中，所以这里我们传入0
        Ⅲ gl.vertexAttribPointer(gl.getAttribLocation(this.program, "aPosition"), 3, gl.FLOAT, false, 0, 0);
       
        * ④ 如法炮制加入另外一个attribute==>this.colorBuffer
          //启用顶点纹理坐标数据数组
        Ⅰ gl.enableVertexAttribArray(gl.getAttribLocation(this.program, "aTexCoor"));
          //给管线指定顶点纹理坐标数据
        Ⅱ gl.vertexAttribPointer(gl.getAttribLocation(this.program, "aTexCoor"), 2, gl.FLOAT, false, 0, 0);
        Ⅲ gl.bindBuffer(gl.ARRAY_BUFFER, null);
          // 解绑VAO
        Ⅳ gl.bindVertexArray(null)
       */
      console.log('回调函数中cellBO.getCABO()', cellBO.getCABO());
      // 包含①
      cellBO.getCABO().upload(userData, ObjectType.ARRAY_BUFFER); // True

      // const gl = model.context;
      // 创建顶点VBO
      // 创建缓冲区对象
      // model.vertexBuffer = gl.createBuffer();
      // console.log('model.vertexBuffer', model.vertexBuffer);
      // // 将缓冲区对象绑定到目标
      // gl.bindBuffer(gl.ARRAY_BUFFER, model.vertexBuffer);
      // console.log(userData);
      // // 向缓冲区中写入数据
      // gl.bufferData(gl.ARRAY_BUFFER, userData, gl.STATIC_DRAW);
      // 步骤②在处理VertexMC及normalMC时触发
      // 验证attribute是否在Shader中应用==>gl.getAttribLocation()需要在Shader中进行应用
      if (cellBO.getProgram().isAttributeUsed('vertexOffsetMC')) {
        if (
          // 包含步骤③
          cellBO
            .getVAO()
            // Add an attribute to the VAO with the specified characteristics
            .addAttributeArray(
              cellBO.getProgram(), // shaderProgram
              cellBO.getCABO(), // buffer
              'vertexOffsetMC', // name==>INVALID_VALUE: enableVertexAttribArray: index out of range/vertexAttribPointer: index out of range==>未设置数值
              cellBO.getCABO().getVertexOffset(), // offset
              cellBO.getCABO().getStride(), // 连续的顶点属性组之间的间隔
              model.context.FLOAT, // elementType
              3, // elementTupleSize
              false // 是否希望数据被标准化
            )
        ) {
          console.log('Success setting vertexOffsetMC in shader VAO.');
        }
      } else {
        console.log('未进行设置');
      }

      // const vertexOffsetMCLocation = gl.getAttribLocation(
      //   cellBO.getProgram().getHandle(),
      //   'vertexOffsetMC'
      // );
      // gl.vertexAttribPointer(vertexOffsetMCLocation, 3, gl.FLOAT, false, 24, 6);
      // gl.enableVertexAttribArray(vertexOffsetMCLocation);

      // cellBO.getVAO.bind();
      // // 解绑VAO
      // gl.bindVertexArray(null);
      console.log('cellBO.getCABO()', cellBO.getCABO());
    },
  });

  renderer.addActor(actor);
  resetCamera();
  render();
  // return actor;
});

function jsonReader(data) {
  if (!data) return null;
  const mapper = vtkMapper.newInstance();
  const actor = vtkActor.newInstance();
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
  // actor.getProperty().setEdgeColor([1, 0, 1]);
  // 加载数据
  mapper.setInputData(polydata);
  actor.setMapper(mapper);
  renderer.addActor(actor);
  resetCamera();
  render();
  return null;
}

// ----------------------------------------------------------------------------
// Example code
// ----------------------------------------------------------------------------
// jsonReader(jsondata);
// // console.log(jsonReaderActor);
// const vtkReaderActor = vtkReader();

// renderer.addActor(vtkReaderActor);
