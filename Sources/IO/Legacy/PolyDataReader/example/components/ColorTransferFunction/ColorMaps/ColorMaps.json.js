import Colors, { convertToRGBPoint } from './Constants';

const { viridis, magma, plasma, inferno, cividis, mako, rocket, turbo, cooltowarm } = Colors;

/* eslint-disable */
var vtkColorMaps = [
  {
    ColorSpace: "RGB",
		Name: "Viridis",
		RGBPoints: convertToRGBPoint(viridis)
	},
  {
    ColorSpace: "RGB",
		Name: "Magma",
		RGBPoints: convertToRGBPoint(magma)
	},
  {
    ColorSpace: "RGB",
		Name: "Plasma",
		RGBPoints: convertToRGBPoint(plasma)
	},
  {
    ColorSpace: "RGB",
		Name: "Inferno",
		RGBPoints: convertToRGBPoint(inferno)
	},
  {
    ColorSpace: "RGB",
		Name: "Cividis",
		RGBPoints: convertToRGBPoint(cividis)
	},
  {
    ColorSpace: "RGB",
		Name: "Mako",
		RGBPoints: convertToRGBPoint(mako)
	},
  {
    ColorSpace: "RGB",
		Name: "Rocket",
		RGBPoints: convertToRGBPoint(rocket)
	},
  {
    ColorSpace: "RGB",
		Name: "Turbo",
		RGBPoints: convertToRGBPoint(turbo)
	},
  {
    ColorSpace: "RGB",
		Name: "CooltoWarm",
		RGBPoints: convertToRGBPoint(cooltowarm)
	},
];

export { vtkColorMaps as v };
