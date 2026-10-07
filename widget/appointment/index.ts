import { registerWidget } from "../shared/loader-contract";
import { mountAppointment } from "./widget";

// widgets/appointment.js: loaded by widget.js when a page has
// <div data-chatalot="appointment">.
registerWidget("appointment", mountAppointment);
