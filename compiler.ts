import { stringInput } from "lezer-tree";
import { Stmt, Expr } from "./ast";
import { parse } from "./parser";

// https://learnxinyminutes.com/docs/wasm/

// Numbers are offsets into global memory
export type GlobalEnv = {
  globals: Map<string, number>;
  offset: number;
  func: Array<string>;
}

export const emptyEnv = { globals: new Map(), offset: 0 };
var while_counter = 0;

export function augmentEnv(env: GlobalEnv, stmts: Array<Stmt>) : GlobalEnv {
  const newEnv = new Map(env.globals);
  var newFuncs = ''; 
  var newOffset = env.offset;
  stmts.forEach((s) => {
    switch(s.tag) {
      case "assign":
        newEnv.set(s.name, newOffset);
        newOffset += 1;
        break;
      case "function":
        var funcSource = codeGenFunction(s, env);
        funcSource.forEach(element => {
          //really rubbish solution (TEMP FIX)
          if (!element.includes('scratch')){
            newFuncs = newFuncs.concat(element);
          }
        }); 
        break;
    }
  });
  return {
    globals: newEnv,
    offset: newOffset,
    func: env.func.concat([newFuncs])
  }
}

type CompileResult = {
  wasmSource: string,
  newEnv: GlobalEnv
};

export function compile(source: string, env: GlobalEnv) : CompileResult {
  const ast = parse(source);
  const withDefines = augmentEnv(env, ast);
  const scratchVar : string =  `(local $scratch i32)`;
  const localDefines = [scratchVar];
  ast.forEach(v => {
    if (v.tag == "assign")
      localDefines.push(`(local $${v.name} i32)`);
  })

  const commandGroups = ast.map((stmt) => codeGenStmt(stmt, withDefines,false));
  const commands = localDefines.concat([].concat.apply([], commandGroups));
  //const commands = [].concat.apply([], commandGroups);
  return {
    wasmSource: commands.join("\n"),
    newEnv: withDefines
  };
}

function envLookup(env : GlobalEnv, name : string) : number {
  if(!env.globals.has(name)) { console.log("Could not find " + name + " in ", env); throw new Error("Could not find name " + name); }
  return (env.globals.get(name)* 4); // 4-byte values
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function codeGenFunction(stmt: Stmt, env: GlobalEnv) : Array<string> {
  if(stmt.tag == "function"){
    var funcStmts = Array("(func $" + stmt.name);                       // (func
    stmt.params.forEach(element => {
      funcStmts = funcStmts.concat("(param $" + element[0] + " i32)")   // (param $val i32)
    });

    if(stmt.return_type == 'int' || stmt.return_type == 'bool'){        // (result i32)
      funcStmts = funcStmts.concat("(result i32)");
    }

    stmt.body.forEach(element => {                                      // (local $element i32)
      if(element.tag == "assign"){
        funcStmts = funcStmts.concat(`(local $${element.name} i32)`)
      }
    });
    
    stmt.body.forEach(element => {                                      // function body
      funcStmts = funcStmts.concat(codeGenStmt(element,env,true));
    });

    funcStmts = funcStmts.concat(")");
    return funcStmts;  
  }
  else{
    throw new Error("Error parsing function");
  }
}

function codeGenStmt(stmt: Stmt, env: GlobalEnv, func_var: boolean) : Array<string> {
  switch(stmt.tag) {  
    //CODEGEN FOR PASS
    //case "pass":
      //return ["(return)"]
    //CODE GEN FOR RETURN
    case "return":
      return codeGenExpr(stmt.value,env,func_var);
    
    //CODE GEN FOR IF-ELIF-ELSE CONSTRUCT
    case "if_stmt":
      var ifStmts = codeGenExpr(stmt.condition,env,func_var);
      ifStmts = ifStmts.concat("(if");
      ifStmts = ifStmts.concat("(then");
      stmt.body.forEach(element => {
        ifStmts = ifStmts.concat(codeGenStmt(element,env,func_var)); 
      });
      ifStmts = ifStmts.concat(")");

      if (stmt.else == true){
        ifStmts = ifStmts.concat("(else");
        if (stmt.elif_exists == true){
          ifStmts = ifStmts.concat(codeGenExpr(stmt.elif_cond,env,func_var))
          ifStmts = ifStmts.concat("(if");
          ifStmts = ifStmts.concat("(then");
          stmt.elif_body.forEach(element => {
            ifStmts = ifStmts.concat(codeGenStmt(element,env,func_var));
          });       
          ifStmts = ifStmts.concat(")"); 
          ifStmts = ifStmts.concat("(else");
          stmt.else_body.forEach(element => {
            ifStmts = ifStmts.concat(codeGenStmt(element,env,func_var));
          });
          ifStmts = ifStmts.concat(")");
          ifStmts = ifStmts.concat(")");
        }
        else{
          stmt.else_body.forEach(element => {
            ifStmts = ifStmts.concat(codeGenStmt(element,env,func_var));
          });
          ifStmts = ifStmts.concat(")");
          ifStmts = ifStmts.concat(")");
        }
      }

      return ifStmts.concat(")")
    
    //CODE GEN FOR WHILE STATEMENTS
    case "while_stmt":
      var whileStmts = Array("(block $cond_break" + while_counter.toString());
      whileStmts = whileStmts.concat("(loop $label" + while_counter.toString());
      whileStmts = whileStmts.concat(codeGenExpr(stmt.condition,env,func_var));
      whileStmts = whileStmts.concat("(i32.const 1)");
      whileStmts = whileStmts.concat("(i32.ne)");
      whileStmts = whileStmts.concat("(br_if $cond_break" + while_counter.toString() + ")");
      stmt.body.forEach(element => {
        whileStmts = whileStmts.concat(codeGenStmt(element,env,func_var));
      });
     
      whileStmts = whileStmts.concat("(br $label" + while_counter.toString() +")");
      whileStmts = whileStmts.concat(")"); //close loop
      whileStmts = whileStmts.concat(")"); //close block
      while_counter = while_counter + 1; //to create distinct labels
      return whileStmts
    
    //CODEGEN FOR ASSIGNMENT STATEMENTS
    case "assign":
      if(func_var == true){
        var valStmts = codeGenExpr(stmt.value,env,func_var);
        return valStmts.concat([`(local.set $${stmt.name})`]); 
      }           
      const locationToStore = [`(i32.const ${envLookup(env, stmt.name)}) ;; ${stmt.name}`];
      var valStmts = codeGenExpr(stmt.value, env,func_var);
      return locationToStore.concat(valStmts).concat([`(i32.store)`]);

    //CODE GEN FOR EXPRESSION STATEMENTS
    case "expr":
      var exprStmts = codeGenExpr(stmt.expr,env,func_var);
      return exprStmts.concat([`(local.set $scratch)`]);               //NEED CHANGE
  }
}

function codeGenExpr(expr : Expr, env: GlobalEnv, func_var: boolean) : Array<string> {
  switch(expr.tag) {
    case "num":
      return ["(i32.const " + expr.value + ")"];

    case "bool":
      if (expr.value == "True"){
        return ["(i32.const " + 1 + ")"]
      }
      else if (expr.value == "False") {
        return ["(i32.const " + 0 + ")"]
      }
      else {return}

    case "id":
      if (func_var == true){
        return [`(local.get $${expr.name})`];
      }
      return [`(i32.const ${envLookup(env, expr.name)})`, `i32.load `];                                    //NEED CHANGE

    case "uni_op":
      switch(expr.op){
        case "-":
          const uniStmt = ["(i32.const " + 0 + ")"];
          const unicodegen = codeGenExpr(expr.arg,env,func_var)
          unicodegen.forEach(function(value){uniStmt.push(value)}) 
          return uniStmt.concat(["(i32.sub)"]);
        case "not"://CODE GEN FOR PASS
          const notStmt = Array();
          const notcodegen = codeGenExpr(expr.arg,env,func_var);
          notcodegen.forEach(element => {notStmt.push(element)})
          notStmt.push(["(i32.const 1)"]);
          return notStmt.concat(["(i32.ne)"]);
        default:
          throw new Error("Unary Operation does not exist")
      }
      
    case "bin_op":
      const argStmt1 = codeGenExpr(expr.arg1,env,func_var);
      const argStmt2 = codeGenExpr(expr.arg2,env,func_var);
      const argStmt = argStmt1.concat(argStmt2);
      switch(expr.op){
        case "+":
          return argStmt.concat(["(i32.add)"]);
        case "-":
          return argStmt.concat(["(i32.sub)"]);
        case "*":
          return argStmt.concat(["(i32.mul)"]);
        case "//":
          return argStmt.concat(["(i32.div_s)"]);
        case "%":
          return argStmt.concat(["(i32.rem_s)"]);
        case "==":
          return argStmt.concat(["(i32.eq)"]);
        case "!=":
          return argStmt.concat(["(i32.ne)"]);
        case "<":
          return argStmt.concat(["(i32.lt_s)"]);
        case "<=":
          return argStmt.concat(["(i32.le_s)"]);
        case ">":
          return argStmt.concat(["(i32.gt_s)"]);
        case ">=":
          return argStmt.concat(["(i32.ge_s)"]);
        default:
          throw new Error("Unable to parse binary expression");
      }

    case "calls":
      var i;
      const callStmts = Array<string>(); 
      for (i = 0; i < expr.arg.length; i++){
        const callcodegen = codeGenExpr(expr.arg[i],env,func_var);
        callcodegen.forEach(element => {callStmts.push(element)}); 
      }
      return callStmts.concat([`(call $${expr.name})`]);

    case "globals":
      var globalStmts : Array<string> = [];
      env.globals.forEach((pos, name) => {
        globalStmts.push(
          `(i32.const ${pos})`,
          `(i32.const ${envLookup(env, name)})`,
          `(i32.load)`,
          `(call $printglobal)`
        );
      });
      return globalStmts; 
  }
}

//Helper Function
function pad_bits(arg: string) : string{
  if (arg.length < 31){
    var pad_str = '';
    for (var i = 0; i < 31-arg.length; i++){
      pad_str = pad_str.concat('0');
    }
    arg = pad_str.concat(arg);
  }
  return arg
}