import {
  createOnRequest
} from "./../chunk-ytvdsmzg.js";

// src/action/api/action.ts
async function GET(data) {
  console.log(data);
  return {
    sucess: true
  };
}
var handlers = {
  GET: typeof GET === "function" ? GET : undefined,
  POST: typeof POST === "function" ? POST : undefined,
  PUT: typeof PUT === "function" ? PUT : undefined,
  DELETE: typeof DELETE === "function" ? DELETE : undefined,
  PATCH: typeof PATCH === "function" ? PATCH : undefined,
  HEAD: typeof HEAD === "function" ? HEAD : undefined,
  OPTIONS: typeof OPTIONS === "function" ? OPTIONS : undefined
};
var onRequest = createOnRequest(handlers);
export {
  onRequest,
  GET
};

//# debugId=75C158369041F26564756E2164756E21
//# sourceMappingURL=./api/action.js.map
