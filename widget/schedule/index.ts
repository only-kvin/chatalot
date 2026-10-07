import { registerWidget } from "../shared/loader-contract";
import { mountSchedule } from "./widget";

// widgets/schedule.js: loaded by widget.js when a page has
// <div data-chatalot="schedule">.
registerWidget("schedule", mountSchedule);
