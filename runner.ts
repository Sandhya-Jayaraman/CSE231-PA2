// This is a mashup of tutorials from:
//
// - https://github.com/AssemblyScript/wabt.js/
// - https://developer.mozilla.org/en-US/docs/WebAssembly/Using_the_JavaScript_API

import wabt from 'wabt';
import { electron } from 'webpack';
import * as compiler from './compiler';
import {parse} from './parser';

// NOTE(joe): This is a hack to get the CLI Repl to run. WABT registers a global
// uncaught exn handler, and this is not allowed when running the REPL
// (https://nodejs.org/api/repl.html#repl_global_uncaught_exceptions). No reason
// is given for this in the docs page, and I haven't spent time on the domain
// module to figure out what's going on here. It doesn't seem critical for WABT
// to have this support, so we patch it away.
if(typeof process !== "undefined") {
  const oldProcessOn = process.on;
  process.on = (...args : any) : any => {
    if(args[0] === "uncaughtException") { return; }
    else { return oldProcessOn.apply(process, args); }
  };
}

export async function run(source : string, config: any) : Promise<[any, compiler.GlobalEnv]> {
  const wabtInterface = await wabt();
  const parsed = parse(source);
  var returnType = "";
  var returnExpr = "";
  if(parsed[parsed.length - 1].tag === "expr") {
    returnType = "(result i32)";
    returnExpr = "(local.get $scratch)"
  }
  const compiled = compiler.compile(source, config.env);
  const importObject = config.importObject;
  if(!importObject.js) {
    const memory = new WebAssembly.Memory({initial:10, maximum:100});
    importObject.js = { memory: memory };
  }
  
  var funcSource = "";
  compiled.newEnv.func.forEach(element => {
    funcSource = funcSource.concat(element);
  });
  console.log("funcs:",funcSource);

  const wasmSource = `(module
    (func $print (import "imports" "imported_func") (param i32)(result i32))
    (func $printglobal (import "imports" "print_global_func") (param i32) (param i32))
    (import "js" "memory" (memory 1))

    ${funcSource}
    
    (func (export "exported_func") ${returnType}
      ${compiled.wasmSource}
      ${returnExpr}
    )
  )`;
   
  console.log("wasmSource:", wasmSource);

  const myModule = wabtInterface.parseWat("test.wat", wasmSource);
  var asBinary = myModule.toBinary({});
  var wasmModule = await WebAssembly.instantiate(asBinary.buffer, importObject);
  const result = (wasmModule.instance.exports.exported_func as any)();
  return [result, compiled.newEnv];
}
