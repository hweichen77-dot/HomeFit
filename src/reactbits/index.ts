import type { ComponentType } from "react";

import AnimatedContentRaw from "./AnimatedContent.jsx";
import AuroraRaw from "./Aurora.jsx";
import ClickSparkRaw from "./ClickSpark.jsx";
import CountUpRaw from "./CountUp.jsx";
import ElasticSliderRaw from "./ElasticSlider.jsx";
import ElectricBorderRaw from "./ElectricBorder.jsx";
import GradualBlurRaw from "./GradualBlur.jsx";
import LightRaysRaw from "./LightRays.jsx";
import MagnetRaw from "./Magnet.jsx";
import ShinyTextRaw from "./ShinyText.jsx";
import SpotlightCardRaw from "./SpotlightCard.jsx";
import SplitTextRaw from "./SplitText.jsx";
import StarBorderRaw from "./StarBorder.jsx";

type Loose = ComponentType<Record<string, unknown>>;

export const AnimatedContent = AnimatedContentRaw as unknown as Loose;
export const Aurora = AuroraRaw as unknown as Loose;
export const ClickSpark = ClickSparkRaw as unknown as Loose;
export const CountUp = CountUpRaw as unknown as Loose;
export const ElasticSlider = ElasticSliderRaw as unknown as Loose;
export const ElectricBorder = ElectricBorderRaw as unknown as Loose;
export const GradualBlur = GradualBlurRaw as unknown as Loose;
export const LightRays = LightRaysRaw as unknown as Loose;
export const Magnet = MagnetRaw as unknown as Loose;
export const ShinyText = ShinyTextRaw as unknown as Loose;
export const SpotlightCard = SpotlightCardRaw as unknown as Loose;
export const SplitText = SplitTextRaw as unknown as Loose;
export const StarBorder = StarBorderRaw as unknown as Loose;
