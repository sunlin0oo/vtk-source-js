import macro from 'vtk.js/Sources/macros';
import Constants from 'vtk.js/Sources/Rendering/OpenGL/BufferObject/Constants';

const { ObjectType } = Constants;

// ----------------------------------------------------------------------------
// Global methods
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// Static API
// ----------------------------------------------------------------------------

export const STATIC = {};

// ----------------------------------------------------------------------------
// vtkOpenGLBufferObject methods
// ----------------------------------------------------------------------------

function vtkOpenGLBufferObject(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkOpenGLBufferObject');

  // Class-specific private functions
  // 改变类型函数
  function convertType(type) {
    switch (type) {
      case ObjectType.ELEMENT_ARRAY_BUFFER:
        return model.context.ELEMENT_ARRAY_BUFFER;
      case ObjectType.TEXTURE_BUFFER:
        if ('TEXTURE_BUFFER' in model.context) {
          return model.context.TEXTURE_BUFFER;
        }
      /* eslint-disable no-fallthrough */
      // Intentional fallthrough in case there is no TEXTURE_BUFFER in WebGL
      case ObjectType.ARRAY_BUFFER:
      default:
        return model.context.ARRAY_BUFFER;
      /* eslint-enable no-fallthrough */
    }
  }

  let internalType = null;
  let internalHandle = null;
  let dirty = true;
  let error = '';

  // Public API methods
  publicAPI.getType = () => internalType;

  publicAPI.setType = (value) => {
    internalType = value;
  };

  publicAPI.getHandle = () => internalHandle;
  publicAPI.isReady = () => dirty === false;

  publicAPI.generateBuffer = (type) => {
    const objectTypeGL = convertType(type);
    if (internalHandle === null) {
      // 创建缓冲区对象==>internalHandle全局标量变量用于存储产生的VBO
      internalHandle = model.context.createBuffer();
      internalType = type;
    }
    console.log('internalType', internalType);
    return convertType(internalType) === objectTypeGL;
  };

  publicAPI.upload = (data, type) => {
    // buffer, size, type
    // 1.创建缓冲区对象==>一个缓冲ID生成一个VBO对象
    const alreadyGenerated = publicAPI.generateBuffer(type);
    console.log('alreadyGenerated', alreadyGenerated);
    if (!alreadyGenerated) {
      error = 'Trying to upload array buffer to incompatible buffer.';
      return false;
    }
    // 2.绑定缓冲区对象及顶点缓冲对象的缓冲类型
    model.context.bindBuffer(convertType(internalType), internalHandle);
    // 3.把定义好的顶点数据复制到缓冲的内存中
    model.context.bufferData(
      convertType(internalType),
      data,
      model.context.STATIC_DRAW
    );
    dirty = false;
    return true;
  };

  publicAPI.bind = () => {
    if (!internalHandle) {
      return false;
    }
    console.log(
      'BufferObject中internalHandle',
      internalHandle,
      convertType(internalType)
    );

    model.context.bindBuffer(convertType(internalType), internalHandle);
    return true;
  };

  publicAPI.release = () => {
    if (!internalHandle) {
      return false;
    }
    model.context.bindBuffer(convertType(internalType), null);
    return true;
  };

  publicAPI.releaseGraphicsResources = () => {
    if (internalHandle !== null) {
      model.context.bindBuffer(convertType(internalType), null);
      model.context.deleteBuffer(internalHandle);
      internalHandle = null;
    }
  };

  publicAPI.setOpenGLRenderWindow = (rw) => {
    if (model._openGLRenderWindow === rw) {
      return;
    }
    publicAPI.releaseGraphicsResources();
    model._openGLRenderWindow = rw;
    model.context = null;
    if (rw) {
      model.context = model._openGLRenderWindow.getContext();
    }
  };

  publicAPI.getError = () => error;
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  objectType: ObjectType.ARRAY_BUFFER,
  // _openGLRenderWindow: null,
  context: null,
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  // Object methods
  macro.obj(publicAPI, model);

  macro.get(publicAPI, model, ['_openGLRenderWindow']);
  macro.moveToProtected(publicAPI, model, ['openGLRenderWindow']);

  vtkOpenGLBufferObject(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend);

// ----------------------------------------------------------------------------

export default { newInstance, extend, ...STATIC, ...Constants };
