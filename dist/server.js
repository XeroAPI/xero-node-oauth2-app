"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const port = 5000;
app_1.default.listen(port, function () {
    console.log('Express server running at http://localhost:' + port);
});
//# sourceMappingURL=server.js.map