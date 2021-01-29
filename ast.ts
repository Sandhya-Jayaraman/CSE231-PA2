/*
Compiler V5:
With REPL                                                                      done. to do: func def in repl
typecheck                                                                      to do

*This compiler has the following grammar:

program := <var_def | func_def>* <stmt>*
var_def := <typed_var> = <literal>
typed_var := <name> : <type>
func_def := def <name>([<typed_var> [, <typed_var>]*]?) [-> <type>]? : <func_body>
func_body := <var_def>* <stmt>+                                                 done func

stmt := <name> = <expr>
      | if <expr>: <stmt>+ [elif <expr>: <stmt>+]* [else: <stmt>+]?             done 
      | while <expr>: <stmt>+                                                   done
      | pass                                                                    Compiler V5
      | return <expr>?                                                          done
      | <expr>                                                                  done
expr := <literal>                                                               to do None
      | <name>                                                                  done
      | <uniop> <expr>                                                          not
      | <expr> <binop> <expr>                                                   done. left-is
      | ( <expr> )                                                              done
      | <name>([<expr> [, <expr>]*]?)                                           done
uniop := not | - | abs                                                          done
binop := + | - | * | // | % | == | != | <= | >= | < | > | is                    done. left-is
literal := None
         | True                                                                 done
         | False                                                                done
         | <number>                                                             done
type := int | bool                                                              done
number := 32-bit integer literals                                               done
*/
export type Stmt =
  | { tag: "function", name: string, params: Array<[string, string]>, return_type: string, body: Array<Stmt>}  //params: [(param_name, param_type)]
  | { tag: "if_stmt", condition: Expr, body: Array<Stmt>, elif_exists: boolean, elif_cond: Expr, elif_body: Array<Stmt>, else: boolean, else_body: Array<Stmt>}
  | { tag: "while_stmt", condition: Expr, body: Array<Stmt>}
  | { tag: "return" , value: Expr}
  | { tag: "assign", name: string, dt_type: string, value: Expr }
  | { tag: "expr", expr: Expr }

export type Expr =
  | { tag: "expr", value: Expr}
  | { tag: "num", value: number }
  | { tag: "bool", value: string}
  | { tag: "globals"}
  | { tag: "id", name: string }
  | { tag: "uni_op", op: string, arg: Expr }
  | { tag: "bin_op", arg1: Expr, op: string, arg2: Expr} 
  | { tag: "calls", name: string, arg: Array<Expr>}
  