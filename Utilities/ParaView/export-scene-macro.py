import zipfile
from urllib.parse import quote
import hashlib
import shutil
import gzip
import json
import errno
import time
import os
import sys

from paraview.vtk import *
from paraview import simple


# ### ----------------------------------------------------------------------- ###
# ###                       Configure output location                         ###
# ###
# A top-level export directory will be created (if necessary) and used to
# store all exported scenes.  Use the EXPORT_DIRECTORY pattern below to
# customize where this directory should be.  Automatic replacement will
# be done on the following variables if they appear in the pattern:
#
# ${USER_HOME} : Will be replaced by the current user's home directory
# ### ----------------------------------------------------------------------- ###

EXPORT_DIRECTORY = '${USER_HOME}/vtkJsExport'
FILENAME_EXTENSION = '.vtkjs'

# ### ----------------------------------------------------------------------- ###
# ###                   Convenience methods and definitions                   ###
# ### ----------------------------------------------------------------------- ###


try:
  from vtk.vtkFiltersGeometry import vtkCompositeDataGeometryFilter
except:
  from vtkFiltersGeometry import vtkCompositeDataGeometryFilter

USER_HOME = os.path.expanduser('~')
ROOT_OUTPUT_DIRECTORY = EXPORT_DIRECTORY.replace('${USER_HOME}', USER_HOME)
ROOT_OUTPUT_DIRECTORY = os.path.normpath(ROOT_OUTPUT_DIRECTORY)

arrayTypesMapping = '  bBhHiIlLfdLs'  # last ones are idtype and string

jsMapping = {
    'b': 'Int8Array',
    'B': 'Uint8Array',
    'h': 'Int16Array',
    'H': 'Int16Array',
    'i': 'Int32Array',
    'I': 'Uint32Array',
    'l': 'Int32Array',
    'L': 'Uint32Array',
    'f': 'Float32Array',
    'd': 'Float64Array',
    's': 'string',
}

writerMapping = {}

# -----------------------------------------------------------------------------


def getRangeInfo(array, component):
  r = array.GetRange(component)
  compRange = {}
  compRange['min'] = r[0]
  compRange['max'] = r[1]
  compRange['component'] = array.GetComponentName(component)
  return compRange


# -----------------------------------------------------------------------------

def getRef(destDirectory, md5):
  ref = {}
  ref['id'] = md5
  ref['encode'] = 'BigEndian' if sys.byteorder == 'big' else 'LittleEndian'
  ref['basepath'] = destDirectory
  return ref


# -----------------------------------------------------------------------------

objIds = []


def getObjectId(obj):
  try:
    idx = objIds.index(obj)
    return idx + 1
  except ValueError:
    objIds.append(obj)
    return len(objIds)


# -----------------------------------------------------------------------------

def dumpDataArray(datasetDir, dataDir, array, root=None, compress=True):
  if not array:
    return None

  if root is None:
    root = {}

  if array.GetDataType() == 12:
    # IdType need to be converted to Uint32
    arraySize = array.GetNumberOfTuples() * array.GetNumberOfComponents()
    newArray = vtkTypeUInt32Array()
    newArray.SetNumberOfTuples(arraySize)
    for i in range(arraySize):
      newArray.SetValue(i, -1 if array.GetValue(i)
                        < 0 else array.GetValue(i))
    pBuffer = memoryview(newArray)
  elif array.GetDataType() == 13:
    # vtkStringArray - write as utf-8 encoded string that contains a json array with the strings
    arraySize = array.GetNumberOfTuples() * array.GetNumberOfComponents()
    newArray = json.dumps([array.GetValue(v) for v in range(arraySize)])
    pBuffer = memoryview(newArray.encode('utf-8'))
  else:
    pBuffer = memoryview(array)

  pMd5 = hashlib.md5(pBuffer).hexdigest()
  pPath = os.path.join(dataDir, pMd5)
  with open(pPath, 'wb') as f:
    f.write(pBuffer)

  if compress:
    with open(pPath, 'rb') as f_in, gzip.open(os.path.join(dataDir, pMd5 + '.gz'), 'wb') as f_out:
      shutil.copyfileobj(f_in, f_out)
      os.remove(pPath)

  root['ref'] = getRef(os.path.relpath(dataDir, datasetDir), pMd5)
  root['vtkClass'] = 'vtkDataArray'
  root['name'] = array.GetName()
  root['dataType'] = jsMapping[arrayTypesMapping[array.GetDataType()]]
  root['numberOfComponents'] = array.GetNumberOfComponents()
  root['size'] = array.GetNumberOfComponents() * array.GetNumberOfTuples()
  root['ranges'] = []

  if array.GetDataType() != 13:  # ranges do not make sense for vtkStringArray
    if root['numberOfComponents'] > 1:
      for i in range(root['numberOfComponents']):
        root['ranges'].append(getRangeInfo(array, i))
      root['ranges'].append(getRangeInfo(array, -1))
    else:
      root['ranges'].append(getRangeInfo(array, 0))

  return root


# -----------------------------------------------------------------------------

def dumpColorArray(datasetDir, dataDir, colorArrayInfo, root=None, compress=True):
  if root is None:
    root = {}

  colorArray = colorArrayInfo['colorArray']
  location = colorArrayInfo['location']

  dumpedArray = dumpDataArray(datasetDir, dataDir, colorArray, {}, compress)

  if dumpedArray:
    root[location]['activeScalars'] = 0
    root[location]['arrays'].append({'data': dumpedArray})

  return root


# -----------------------------------------------------------------------------

def dumpTCoords(datasetDir, dataDir, dataset, root=None, compress=True):
  if root is None:
    root = {}

  tcoords = dataset.GetPointData().GetTCoords()
  if tcoords:
    dumpedArray = dumpDataArray(datasetDir, dataDir, tcoords, {}, compress)
    root['pointData']['activeTCoords'] = len(root['pointData']['arrays'])
    root['pointData']['arrays'].append({'data': dumpedArray})


# -----------------------------------------------------------------------------

def dumpNormals(datasetDir, dataDir, dataset, root=None, compress=True):
  if root is None:
    root = {}

  normals = dataset.GetPointData().GetNormals()
  if normals:
    dumpedArray = dumpDataArray(datasetDir, dataDir, normals, {}, compress)
    root['pointData']['activeNormals'] = len(root['pointData']['arrays'])
    root['pointData']['arrays'].append({'data': dumpedArray})


# -----------------------------------------------------------------------------

def dumpAllArrays(datasetDir, dataDir, dataset, root=None, compress=True):
  if root is None:
    root = {}

  root['pointData'] = {
      'vtkClass': 'vtkDataSetAttributes',
      "activeGlobalIds": -1,
      "activeNormals": -1,
      "activePedigreeIds": -1,
      "activeScalars": -1,
      "activeTCoords": -1,
      "activeTensors": -1,
      "activeVectors": -1,
      "arrays": []
  }
  root['cellData'] = {
      'vtkClass': 'vtkDataSetAttributes',
      "activeGlobalIds": -1,
      "activeNormals": -1,
      "activePedigreeIds": -1,
      "activeScalars": -1,
      "activeTCoords": -1,
      "activeTensors": -1,
      "activeVectors": -1,
      "arrays": []
  }
  root['fieldData'] = {
      'vtkClass': 'vtkDataSetAttributes',
      "activeGlobalIds": -1,
      "activeNormals": -1,
      "activePedigreeIds": -1,
      "activeScalars": -1,
      "activeTCoords": -1,
      "activeTensors": -1,
      "activeVectors": -1,
      "arrays": []
  }

  # Point data
  pd = dataset.GetPointData()
  pd_size = pd.GetNumberOfArrays()
  for i in range(pd_size):
    array = pd.GetAbstractArray(i)
    if array:
      dumpedArray = dumpDataArray(
          datasetDir, dataDir, array, {}, compress)
      root['pointData']['activeScalars'] = 0
      root['pointData']['arrays'].append({'data': dumpedArray})

  # Cell data
  cd = dataset.GetCellData()
  cd_size = cd.GetNumberOfArrays()
  for i in range(cd_size):
    array = cd.GetAbstractArray(i)
    if array:
      dumpedArray = dumpDataArray(
          datasetDir, dataDir, array, {}, compress)
      root['cellData']['activeScalars'] = 0
      root['cellData']['arrays'].append({'data': dumpedArray})

  return root


# -----------------------------------------------------------------------------

def dumpPolyData(datasetDir, dataDir, dataset, colorArrayInfo, root=None, compress=True):
  if root is None:
    root = {}

  root['vtkClass'] = 'vtkPolyData'
  container = root

  # Points
  points = dumpDataArray(datasetDir, dataDir,
                         dataset.GetPoints().GetData(), {}, compress)
  points['vtkClass'] = 'vtkPoints'
  container['points'] = points

  # Cells
  _cells = container

  # Verts
  if dataset.GetVerts() and dataset.GetVerts().GetData().GetNumberOfTuples() > 0:
    _verts = dumpDataArray(datasetDir, dataDir,
                           dataset.GetVerts().GetData(), {}, compress)
    _cells['verts'] = _verts
    _cells['verts']['vtkClass'] = 'vtkCellArray'

  # Lines
  if dataset.GetLines() and dataset.GetLines().GetData().GetNumberOfTuples() > 0:
    _lines = dumpDataArray(datasetDir, dataDir,
                           dataset.GetLines().GetData(), {}, compress)
    _cells['lines'] = _lines
    _cells['lines']['vtkClass'] = 'vtkCellArray'

  # Polys
  if dataset.GetPolys() and dataset.GetPolys().GetData().GetNumberOfTuples() > 0:
    _polys = dumpDataArray(datasetDir, dataDir,
                           dataset.GetPolys().GetData(), {}, compress)
    _cells['polys'] = _polys
    _cells['polys']['vtkClass'] = 'vtkCellArray'

  # Strips
  if dataset.GetStrips() and dataset.GetStrips().GetData().GetNumberOfTuples() > 0:
    _strips = dumpDataArray(datasetDir, dataDir,
                            dataset.GetStrips().GetData(), {}, compress)
    _cells['strips'] = _strips
    _cells['strips']['vtkClass'] = 'vtkCellArray'

  dumpAllArrays(datasetDir, dataDir, dataset, container, compress)

  dumpColorArray(datasetDir, dataDir, colorArrayInfo, container, compress)

  # PointData TCoords
  dumpTCoords(datasetDir, dataDir, dataset, container, compress)
  # dumpNormals(datasetDir, dataDir, dataset, container, compress)

  return root


# -----------------------------------------------------------------------------
writerMapping['vtkPolyData'] = dumpPolyData
# -----------------------------------------------------------------------------


def dumpImageData(datasetDir, dataDir, dataset, colorArrayInfo, root=None, compress=True):
  if root is None:
    root = {}

  root['vtkClass'] = 'vtkImageData'
  container = root

  container['spacing'] = dataset.GetSpacing()
  container['origin'] = dataset.GetOrigin()
  container['extent'] = dataset.GetExtent()

  dumpAllArrays(datasetDir, dataDir, dataset, container, compress)

  return root


# -----------------------------------------------------------------------------
writerMapping['vtkImageData'] = dumpImageData
# -----------------------------------------------------------------------------


def writeDataSet(filePath, dataset, outputDir, colorArrayInfo, newDSName=None, compress=True):
  fileName = quote(newDSName if newDSName else os.path.basename(filePath))
  datasetDir = os.path.join(outputDir, fileName)
  dataDir = os.path.join(datasetDir, 'data')

  if not os.path.exists(dataDir):
    os.makedirs(dataDir)

  root = {}
  root['metadata'] = {}
  root['metadata']['name'] = fileName

  writer = writerMapping[dataset.GetClassName()]
  if writer:
    writer(datasetDir, dataDir, dataset, colorArrayInfo, root, compress)
  else:
    print(dataObject.GetClassName(), 'is not supported')

  with open(os.path.join(datasetDir, "index.json"), 'w') as f:
    f.write(json.dumps(root, indent=2))

  return datasetDir

# -----------------------------------------------------------------------------


def generateSceneName():
  srcs = simple.GetSources()

  nameParts = []
  for key, val in srcs.items():
    proxyGroup = val.SMProxy.GetXMLGroup()
    if 'sources' in proxyGroup:
      nameParts.append(key[0])
  fileName = '-'.join(nameParts)

  # limit to a reasonable length characters
  fileName = fileName[:12] if len(fileName) > 15 else fileName
  if len(fileName) == 0:
    fileName = 'SceneExport'
  sceneName = '%s' % fileName
  counter = 0
  while os.path.isfile(os.path.join(ROOT_OUTPUT_DIRECTORY, '%s%s' % (sceneName, FILENAME_EXTENSION))):
    counter += 1
    sceneName = '%s (%d)' % (fileName, counter)

  return sceneName

# -----------------------------------------------------------------------------


componentIndex = 0


def getComponentName(actor):
  global componentIndex
  srcs = simple.GetSources()
  duplicates = {}
  for key, val in srcs.items():
    # Prevent name duplication
    nameToUse = key[0]
    if nameToUse in duplicates:
      count = 1
      newName = '%s (%d)' % (nameToUse, count)
      while newName in duplicates:
        count += 1
        newName = '%s (%d)' % (nameToUse, count)

      nameToUse = newName
    duplicates[nameToUse] = True

    actorRep = simple.GetRepresentation(
        val).GetClientSideObject().GetActiveRepresentation().GetActor()
    if actor == actorRep:
      return nameToUse

  nameToUse = '%d' % componentIndex
  componentIndex += 1
  return nameToUse


# ### ----------------------------------------------------------------------- ###
# ###                          Main script contents                           ###
# ### ----------------------------------------------------------------------- ###

def mkdir_p(path):
  try:
    os.makedirs(path)
  except OSError as exc:  # Python >2.5
    if exc.errno == errno.EEXIST and os.path.isdir(path):
      pass
    else:
      raise


# Generate timestamp and use it to make subdirectory within the top level output dir
timeStamp = time.strftime("%a-%d-%b-%Y-%H-%M-%S")
outputDir = os.path.join(ROOT_OUTPUT_DIRECTORY, timeStamp)
mkdir_p(outputDir)

doCompressArrays = False

# Get the active view and render window, use it to iterate over renderers
activeView = simple.GetActiveView()
renderWindow = activeView.GetRenderWindow()
renderers = renderWindow.GetRenderers()

scDirs = []
sceneComponents = []
textureToSave = {}

for rIdx in range(renderers.GetNumberOfItems()):
  renderer = renderers.GetItemAsObject(rIdx)
  renProps = renderer.GetViewProps()
  for rpIdx in range(renProps.GetNumberOfItems()):
    renProp = renProps.GetItemAsObject(rpIdx)
    if not renProp.GetVisibility():
      continue

    if hasattr(renProp, 'GetMapper'):
      mapper = renProp.GetMapper()
      dataObject = mapper.GetInputDataObject(0, 0)
      dataset = None

      if dataObject.IsA('vtkCompositeDataSet'):
        if dataObject.GetNumberOfBlocks() == 1:
          dataset = dataObject.GetBlock(0)
        else:
          print('Apply geometry filter')
          gf = vtkCompositeDataGeometryFilter()
          gf.SetInputData(dataObject)
          gf.Update()
          dataset = gf.GetOutput()
      else:
        dataset = mapper.GetInput()

      if dataset and dataset.GetPoints():
        componentName = getComponentName(renProp)
        scalarVisibility = mapper.GetScalarVisibility()
        arrayAccessMode = mapper.GetArrayAccessMode()
        colorArrayName = mapper.GetArrayName() if arrayAccessMode == 1 else mapper.GetArrayId()
        colorMode = mapper.GetColorMode()
        scalarMode = mapper.GetScalarMode()
        lookupTable = mapper.GetLookupTable()

        dsAttrs = None
        arrayLocation = ''

        if scalarVisibility:
          # VTK_SCALAR_MODE_USE_POINT_FIELD_DATA or VTK_SCALAR_MODE_USE_POINT_DATA
          if scalarMode == 3 or scalarMode == 1:
            dsAttrs = dataset.GetPointData()
            arrayLocation = 'pointData'
          # VTK_SCALAR_MODE_USE_CELL_FIELD_DATA or VTK_SCALAR_MODE_USE_CELL_DATA
          elif scalarMode == 4 or scalarMode == 2:
            dsAttrs = dataset.GetCellData()
            arrayLocation = 'cellData'

        colorArray = None
        dataArray = None

        if dsAttrs:
          dataArray = dsAttrs.GetAbstractArray(colorArrayName)

        if dataArray:
          # component = -1 => let specific instance get scalar from vector before mapping
          colorArray = lookupTable.MapScalars(
              dataArray, colorMode, -1)
          colorArrayName = '__CustomRGBColorArray__'
          colorArray.SetName(colorArrayName)
          colorMode = 0
        else:
          colorArrayName = ''

        colorArrayInfo = {
            'colorArray': colorArray,
            'location': arrayLocation
        }

        scDirs.append(writeDataSet('', dataset, outputDir, colorArrayInfo,
                      newDSName=componentName, compress=doCompressArrays))

        # Handle texture if any
        textureName = None
        if renProp.GetTexture() and renProp.GetTexture().GetInput():
          textureData = renProp.GetTexture().GetInput()
          textureName = 'texture_%d' % getObjectId(textureData)
          textureToSave[textureName] = textureData

        representation = renProp.GetProperty().GetRepresentation(
        ) if hasattr(renProp, 'GetProperty') else 2
        colorToUse = renProp.GetProperty().GetDiffuseColor(
        ) if hasattr(renProp, 'GetProperty') else [1, 1, 1]
        if representation == 1:
          colorToUse = renProp.GetProperty().GetColor() if hasattr(
              renProp, 'GetProperty') else [1, 1, 1]
        pointSize = renProp.GetProperty().GetPointSize(
        ) if hasattr(renProp, 'GetProperty') else 1.0
        opacity = renProp.GetProperty().GetOpacity() if hasattr(
            renProp, 'GetProperty') else 1.0
        edgeVisibility = renProp.GetProperty().GetEdgeVisibility(
        ) if hasattr(renProp, 'GetProperty') else False

        p3dPosition = renProp.GetPosition() if renProp.IsA(
            'vtkProp3D') else [0, 0, 0]
        p3dScale = renProp.GetScale() if renProp.IsA(
            'vtkProp3D') else [1, 1, 1]
        p3dOrigin = renProp.GetOrigin() if renProp.IsA(
            'vtkProp3D') else [0, 0, 0]
        p3dRotateWXYZ = renProp.GetOrientationWXYZ(
        ) if renProp.IsA('vtkProp3D') else [0, 0, 0, 0]

        sceneComponents.append({
            "name": componentName,
            "type": "httpDataSetReader",
            "httpDataSetReader": {
                "url": componentName
            },
            "actor": {
                "origin": p3dOrigin,
                "scale": p3dScale,
                "position": p3dPosition,
            },
            "actorRotation": p3dRotateWXYZ,
            "mapper": {
                "colorByArrayName": colorArrayName,
                "colorMode": colorMode,
                "scalarMode": scalarMode
            },
            "property": {
                "representation": representation,
                "edgeVisibility": edgeVisibility,
                "diffuseColor": colorToUse,
                "pointSize": pointSize,
                "opacity": opacity
            },
            "lookupTable": {
                "tableRange": lookupTable.GetRange(),
                "hueRange": lookupTable.GetHueRange() if hasattr(lookupTable, 'GetHueRange') else [0.5, 0]
            }
        })

        if textureName:
          sceneComponents[-1]['texture'] = textureName

# Save texture data if any
for key, val in textureToSave.items():
  writeDataSet('', val, outputDir, None, newDSName=key,
               compress=doCompressArrays)

cameraClippingRange = activeView.GetActiveCamera().GetClippingRange()

sceneDescription = {
    "fetchGzip": doCompressArrays,
    "background": activeView.Background.GetData(),
    "camera": {
        "focalPoint": activeView.CameraFocalPoint.GetData(),
        "position": activeView.CameraPosition.GetData(),
        "viewUp": activeView.CameraViewUp.GetData(),
        "clippingRange": [elt for elt in cameraClippingRange]
    },
    "centerOfRotation": activeView.CenterOfRotation.GetData(),
    "scene": sceneComponents
}

indexFilePath = os.path.join(outputDir, 'index.json')
with open(indexFilePath, 'w') as outfile:
  json.dump(sceneDescription, outfile, indent=4)

# -----------------------------------------------------------------------------

# Now zip up the results and get rid of the temp directory

sceneName = generateSceneName()
sceneFileName = os.path.join(
    ROOT_OUTPUT_DIRECTORY, '%s%s' % (sceneName, FILENAME_EXTENSION))

try:
  import zlib
  compression = zipfile.ZIP_DEFLATED
except ImportError:
  compression = zipfile.ZIP_STORED

zf = zipfile.ZipFile(sceneFileName, mode='w')

try:
  for dirName, subdirList, fileList in os.walk(outputDir):
    for fname in fileList:
      fullPath = os.path.join(dirName, fname)
      relPath = '%s/%s' % (sceneName,
                           os.path.relpath(fullPath, outputDir))
      zf.write(fullPath, arcname=relPath, compress_type=compression)
finally:
  zf.close()

shutil.rmtree(outputDir)

print('Finished exporting dataset to: ', sceneFileName)
