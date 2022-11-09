encapsulate a glsl shader
<!-- 封装了一个着色器==>自己定义类型 -->
represents a shader, vertex, fragment, geometry etc

### type
<!-- 着色器类型 -->
The type  of this shader, vertex, fragment, geometry

### source
<!-- 获得源代码 -->
the shader source code

### getError()

Get the error message (empty if none) for the shader. */

### getHandle()

Get the handle of the shader. */

### compile()
<!-- 编译着色器 -->
Compile the shader. A valid context must to current in order to compile the shader.

### cleanup();
