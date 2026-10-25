import { Fraunces, Inter, Nunito } from "next/font/google";
export const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", weight: ["600", "700"] });
export const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", weight: ["400", "600", "700"] });
/** study layout: the clock and interface (neutral grotesk with tabular figures) */
export const inter = Inter({ subsets: ["latin"], variable: "--font-inter", weight: ["300", "400", "500"] });
