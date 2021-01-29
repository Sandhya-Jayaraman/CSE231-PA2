import {parser} from "lezer-python";
import {Tree, TreeCursor} from "lezer-tree";
import {Expr, Stmt} from "./ast";

//This function uses the lezer-python library to parse the source code and initiates traverse.
export function parse(source : string) : Array<Stmt> {
  const t = parser.parse(source);
  return traverse(t.cursor(), source);
}

//This function starts traversing the parsed tree statement wise
export function traverse(c : TreeCursor, s : string) : Array<Stmt> {
  switch(c.node.type.name) {
    case "Script":
      const stmts = [];
      c.firstChild();
      do {
        stmts.push(traverseStmt(c, s));
      } while(c.nextSibling())
      console.log("traversed " + stmts.length + " statements ", stmts, "stopped at " , c.node);
      return stmts;
    default:
      throw new Error("Could not parse program at " + c.node.from + " " + c.node.to);
  }
}

//Function to traverse Statements in the program
export function traverseStmt(c : TreeCursor, s : string) : Stmt {
  switch(c.node.type.name) {
    //function definitions
    case "FunctionDefinition":
      c.firstChild(); // def
      c.nextSibling(); // function name
      const func_name = s.substring(c.from, c.to);
      c.nextSibling(); // parameter list
      c.firstChild(); // open parenthses
      var func_arglist = Array();
      while(c.nextSibling()){
        if(c.node.name == ")"){ break; }
        var param_name = s.substring(c.from, c.to);
        c.nextSibling(); // typedef
        c.firstChild();  // colon
        c.nextSibling(); // data type
        var param_type = s.substring(c.from, c.to);
        func_arglist.push([param_name,param_type]);
        c.parent(); // typedef
        c.nextSibling(); // comma
      }
      c.parent(); // parameter list
      c.nextSibling(); // typedef: return type
      c.firstChild();
      const func_return = s.substring(c.from, c.to);
      c.parent(); // typedef: return type
      c.nextSibling(); // body
      c.firstChild(); // colon
      const func_body = Array<Stmt>();
      while(c.nextSibling()){
        func_body.push(traverseStmt(c, s));
      }
      c.parent(); // body
      c.parent(); // function definition
      return{
        tag: "function",
        name: func_name,
        params: func_arglist,
        return_type: func_return,
        body: func_body
      }
      
    //return statements
    case "ReturnStatement":
      c.firstChild(); //return
      c.nextSibling();
      const return_value = traverseExpr(c, s);
      c.parent(); // return statement
      return{
        tag: "return",
        value: return_value
      }
    
    //pass statements
    case "PassStatement":
      return

    //if statements
    case "IfStatement":
      c.firstChild(); // if
      c.nextSibling(); //condition
      const condition = traverseExpr(c, s);
      c.nextSibling(); // Body
      c.firstChild(); // colon
      const if_body = Array<Stmt>();
      //Info aboult elif: exists?,[condition,body]
      var elif_exists = false;
      var elif_cond;
      const elif_body = Array<Stmt>();
      var else_exists = false;
      const else_body = Array<Stmt>();
      while (c.nextSibling()){ //if body
            if_body.push(traverseStmt(c, s));
      }
      c.parent(); //back to body
      while(c.nextSibling()){// expecting else or elif
        if (c.node.name == "elif"){
          elif_exists = true;
          c.nextSibling(); //go to elif condition
          elif_cond = traverseExpr(c, s);
          c.nextSibling(); //Body
          c.firstChild(); // colon
          while (c.nextSibling()){ //elif body
              elif_body.push(traverseStmt(c, s));
          }
          c.parent(); //back to body
        }
        else if (c.node.name == "else"){
          else_exists = true
          c.nextSibling(); // Body
          c.firstChild(); // colon
          while (c.nextSibling()){ //else body
            else_body.push(traverseStmt(c, s));
          }
          c.parent();
          break;
        }
        else{
          throw new Error("Unable to parse Conditional Statement")
        } 
      } 
      c.parent(); //back to IfStatement
      return{
        tag: "if_stmt",
        condition: condition,
        body: if_body,
        elif_exists: elif_exists,
        elif_cond: elif_cond,
        elif_body: elif_body,
        else: else_exists,
        else_body: else_body
      }
    
    //While loops
    case "WhileStatement":
      c.firstChild(); // while
      c.nextSibling(); // condition
      const while_condition = traverseExpr(c, s);
      const while_body  = Array();
      c.nextSibling(); // Body
      c.firstChild(); // colon
      while(c.nextSibling()){ // while body
        while_body.push(traverseStmt(c, s));
      }
      c.parent();// body
      c.parent();//while
      return{
        tag: "while_stmt",
        condition: while_condition,
        body: while_body
      }

    //var_name: dt_type = value (statically typed)
    case "AssignStatement":
      c.firstChild(); // go to name
      const name = s.substring(c.from, c.to);
      c.nextSibling(); // go to Typedef
      if(c.firstChild()){ ////go to colon
        c.nextSibling(); //go to datatype
        const dt_type = s.substring(c.from,c.to);
        c.parent();

        c.nextSibling(); //go to equals
        c.nextSibling(); // go to value
        const value = traverseExpr(c, s);
        c.parent(); //back to AssignStatement
        return {
          tag: "assign",
          name: name,
          dt_type: dt_type,
          value: value
        }
      } 
      else{
        c.nextSibling(); //go to equals
        c.nextSibling(); //go to value
        const value = traverseExpr(c, s);
        c.parent(); //back to AssignStatement
        const dt_type = "typecheck";
        return {
          tag: "assign",
          name: name,
          dt_type: dt_type,
          value: value
        }
     }    

    //Any type of expression as specified by the grammar  
    case "ExpressionStatement":
      c.firstChild(); //go to the type of expression
      const expr = traverseExpr(c, s);
      c.parent(); //back to ExpressionStatement
      return { tag: "expr", expr: expr }

    default:
      throw new Error("Could not parse stmt at " + c.node.from + " " + c.node.to + ": " + s.substring(c.from, c.to));
  }
}

//Function to traverse expressions
export function traverseExpr(c : TreeCursor, s : string) : Expr {
  switch(c.type.name) {
    //Parse a number
    case "Number":
      return {
        tag: "num",
        value: Number(s.substring(c.from, c.to))
      }
    //Parse a boolean
    case "Boolean":
      return {
        tag: "bool",
        value: s.substring(c.from, c.to)
      }
    //Parse a variable name (need to check if it exists etc etc.)
    case "VariableName":
      return {
        tag: "id",
        name: s.substring(c.from, c.to)
      }
    //Parse a unary experssion per the grammar
    case "UnaryExpression":
      c.firstChild(); //go to the name of the UnaryOp
      const uni_op = s.substring(c.from, c.to);
      c.nextSibling(); //go to the var name or expression
      const uni_arg = traverseExpr(c, s);
      c.parent(); //back to UnaryExpression
      return{
        tag: "uni_op",
        op: uni_op,
        arg: uni_arg
      }
    //Parse a binary expression per the grammar
    case "BinaryExpression":
      c.firstChild(); // go to first operand
      const arg1 = traverseExpr(c, s);
      c.nextSibling(); // go to the operator
      const op = s.substring(c.from, c.to);
      c.nextSibling(); // go to second operand
      const arg2 = traverseExpr(c, s);
      c.parent(); //pop BinaryExpression
      return{
        tag: "bin_op",
        arg1: arg1,
        op: op,
        arg2: arg2
      };
    case "ParenthesizedExpression":
      c.firstChild(); //visit first bracket
      c.nextSibling();
      const parExpr =  traverseExpr(c, s);
      c.parent();//back to parenthesized expression
      return{
        tag: "expr",
        value: parExpr
      }

      
    //Parse function calls of the form: func([<expr> [, <expr>]* ]?)
    case "CallExpression":
      c.firstChild(); //VariableName (func name)
      const callName = s.substring(c.from, c.to);
      //GLOBALS
      if (callName == "globals") {
        c.parent();
        c.parent();
        return {
          tag: "globals"
        };
      }
      //to traverse operands of the format: ([<expr> [, <expr>]* ]?)
      c.nextSibling(); // go to arglist
      c.firstChild(); //first child of arglist: ( -> skip it
      const arglist = Array<Expr>();
      while (c.nextSibling()){
        if (c.node.name != "," && c.node.name != ")"){
          const expr = traverseExpr(c, s);
          arglist.push(expr);
        }
      }
      c.parent(); // back to arglist
      c.parent(); // back to CallExpression
      return{
        tag: "calls",
        name: callName,
        arg: arglist
      }

    default:
      throw new Error("Could not parse expr at " + c.from + " " + c.to + ": " + s.substring(c.from, c.to));
  }
}
