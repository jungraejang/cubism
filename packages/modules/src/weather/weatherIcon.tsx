import type { IconType } from "react-icons";
import {
  WiCloudy,
  WiDayCloudy,
  WiDaySunny,
  WiFog,
  WiNightAltCloudy,
  WiNightClear,
  WiRain,
  WiShowers,
  WiSnow,
  WiSprinkle,
  WiStrongWind,
  WiThunderstorm,
} from "react-icons/wi";

/**
 * Maps Open-Meteo WMO weather codes to a react-icons/weather icon component.
 * Day vs night picks sun/moon variants where applicable.
 */
export function getWeatherIcon(
  code: number,
  isDay: boolean,
): IconType {
  if (code === 0) {
    return isDay ? WiDaySunny : WiNightClear;
  }
  if (code === 1) {
    return isDay ? WiDayCloudy : WiNightAltCloudy;
  }
  if (code === 2) {
    return isDay ? WiDayCloudy : WiNightAltCloudy;
  }
  if (code === 3) {
    return WiCloudy;
  }
  if (code === 45 || code === 48) {
    return WiFog;
  }
  if (code >= 51 && code <= 57) {
    return WiSprinkle;
  }
  if (code >= 61 && code <= 67) {
    return WiRain;
  }
  if (code >= 71 && code <= 77) {
    return WiSnow;
  }
  if (code >= 80 && code <= 82) {
    return WiShowers;
  }
  if (code >= 85 && code <= 86) {
    return WiSnow;
  }
  if (code >= 95 && code <= 99) {
    return WiThunderstorm;
  }
  return WiStrongWind;
}
