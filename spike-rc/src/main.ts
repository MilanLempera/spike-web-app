import "../style.css";
import "./ui/remote.css";
import { SpikeHub } from "spike-link";
import { UI } from "./ui/ui";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Application root not found.");

new UI(root, new SpikeHub());
