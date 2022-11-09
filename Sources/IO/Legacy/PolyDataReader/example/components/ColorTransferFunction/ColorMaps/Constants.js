const viridis = ["#FDF60F", "#E3F313", "#CAF116", "#ACEF1B", "#90EC1F", "#75DE3B", "#5BD057", "#3FC173", "#26B48D", "#0FA7A5", "#139CA6", "#1A8BA7", "#1E7FA7", "#226FA8", "#2561A9", "#2854A9", "#2E429C", "#33318F", "#3C1A78", "#45005C"];
const magma = ["#FFFA92", "#FFC974", "#FE9A57", "#F87E52", "#EC6456", "#E1505D", "#D74164", "#CB306C", "#C32772", "#BB1E78", "#AC1680", "#9A108A", "#880A93", "#790695", "#68048C", "#510376", "#3D0260", "#2E024E", "#190135", "#010119"];
const plasma = ["#F5FF16", "#F7E617", "#FACB19", "#FDB01B", "#FE981F", "#F9832D", "#F56E3A", "#F05847", "#EB4354", "#E72F61", "#D52470", "#BF1C80", "#AA1390", "#940BA0", "#7F03B0", "#6703AA", "#5102A4", "#3A019E", "#230198", "#0C0093"];
const inferno = ["#F4FF70", "#F7E557", "#FACA3D", "#FDAF22", "#FD9611", "#F47E1C", "#EC6727", "#E34F31", "#DA373C", "#D22047", "#BF1A54", "#AB1460", "#980E6D", "#850879", "#730285", "#5B017B", "#450170", "#2E0165", "#17005B", "#000050"];
const cividis = ["#FFEB1A", "#F4DF28", "#E8D437", "#DCC846", "#D1BD53", "#C5B45C", "#B8AB65", "#ACA26D", "#A09976", "#93907F", "#858685", "#777C8A", "#69728F", "#5A6795", "#4C5D9A", "#3D5392", "#2E488A", "#1F3E81", "#0F3379", "#002971"];
const mako = ["#CCFFD9", "#A7F7CF", "#81F0C5", "#5BE8BA", "#3DDEB3", "#3ACCB7", "#37B9BA", "#34A7BE", "#3095C2", "#2D82C6", "#2F70B4", "#325FA3", "#344D92", "#363B81", "#392970", "#372560", "#352150", "#331D40", "#311930", "#2F1520"];
const rocket = ["#FFDEBD", "#FFC49E", "#FEAA7E", "#FE8F5E", "#FD763F", "#F56241", "#ED4F42", "#E53C43", "#DD2845", "#D61546", "#CE0248", "#BA054E", "#A70855", "#930A5B", "#800D62", "#6C1068", "#540F5F", "#3C0D55", "#230C4C", "#0B0B42"];
const turbo = ["#990000", "#B61402", "#D32805", "#F03C07", "#F1640B", "#EF8E0E", "#EDB912", "#EBE216", "#CEEE1A", "#B1F91E", "#96F539", "#7EE069", "#65CC9A", "#4CB8CA", "#34A4FA", "#337CEA", "#3355DB", "#322ECB", "#3F2097", "#4C1262"].reverse();
const cooltowarm = ["#3B4FC3", "#4C5DC6", "#5D6CC9", "#6E7BCB", "#7E8ACE", "#8F98D0", "#A0A7D3", "#B1B6D5", "#C2C5D8", "#D2D4DB", "#D0C0C9", "#CDADB7", "#CA9AA5", "#C88794", "#C57482", "#C26070", "#C04D5E", "#BD3A4D", "#BA263B", "#B81329"];


const colorsLabels = {
  Viridis: 'viridis',
  Magma: 'magma',
  Plasma: 'plasma',
  Inferno: 'inferno',
  Cividis: 'cividis',
  Mako: 'mako',
  Rocket: 'rocket',
  Turbo: 'turbo',
  CooltoWarm: 'cooltowarm'
};

function hex2rgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function rgb255to1(arr) {
  return arr.map(item => {
    return parseFloat(item / 255);
  });
}

function convertToRGBPoint(arr) {
  const l = arr.length;
  const RGBPoints = [];
  arr.map(item => hex2rgb(item)).forEach((element, index) => {
    const pointIndex = index / (l - 1);
    const rgbArr = [element.r, element.g, element.b];
    const rgb = rgb255to1(rgbArr);
    RGBPoints.push(pointIndex, ...rgb);
  });
  return RGBPoints;
}

export { hex2rgb, convertToRGBPoint, colorsLabels, rgb255to1 };

const colors = { viridis, magma, plasma, inferno, cividis, mako, rocket, turbo, cooltowarm };
export default colors;
