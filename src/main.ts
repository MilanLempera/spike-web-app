import "../style.css";
import "./ui/tabs.css";
import "./ui/telemetry.css";
import "./ui/console.css";
import { SpikeHub } from "spike-link";
import { UI } from "./ui/ui";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Application root not found.");

new UI(root, new SpikeHub());
