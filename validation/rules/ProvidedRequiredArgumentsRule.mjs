import { inspect } from "../../jsutils/inspect.mjs";
import { GraphQLError } from "../../error/GraphQLError.mjs";
import { Kind } from "../../language/kinds.mjs";
import { print } from "../../language/printer.mjs";
import { getNamedType, isRequiredArgument, isType, } from "../../type/definition.mjs";
import { specifiedDirectives } from "../../type/directives.mjs";
import { isIntrospectionType } from "../../type/introspection.mjs";
import { typeFromAST } from "../../utilities/typeFromAST.mjs";
/**
 * Provided required arguments
 *
 * A field or directive is only valid if all required (non-null without a
 * default value) field arguments have been provided.
 */
export function ProvidedRequiredArgumentsRule(context) {
    return {
        // eslint-disable-next-line new-cap
        ...ProvidedRequiredArgumentsOnDirectivesRule(context),
        Field: {
            // Validate on leave to allow for deeper errors to appear first.
            leave(fieldNode) {
                const fieldDef = context.getFieldDef();
                if (!fieldDef) {
                    return false;
                }
                const providedArgs = new Set(
                // FIXME: https://github.com/graphql/graphql-js/issues/2203
                /* c8 ignore next */
                fieldNode.arguments?.map((arg) => arg.name.value));
                for (const argDef of fieldDef.args) {
                    if (!providedArgs.has(argDef.name) && isRequiredArgument(argDef)) {
                        const fieldType = getNamedType(context.getType());
                        let parentTypeStr;
                        if (fieldType && isIntrospectionType(fieldType)) {
                            parentTypeStr = '<meta>.';
                        }
                        else {
                            const parentType = context.getParentType();
                            if (parentType) {
                                parentTypeStr = `${context.getParentType()}.`;
                            }
                        }
                        const argTypeStr = inspect(argDef.type);
                        context.reportError(new GraphQLError(`Argument "${parentTypeStr}${fieldDef.name}(${argDef.name}:)" of type "${argTypeStr}" is required, but it was not provided.`, { nodes: fieldNode }));
                    }
                }
            },
        },
        FragmentSpread: {
            // Validate on leave to allow for deeper errors to appear first.
            leave(spreadNode) {
                const fragmentSignature = context.getFragmentSignature();
                if (!fragmentSignature) {
                    return false;
                }
                const providedArgs = new Set(
                // FIXME: https://github.com/graphql/graphql-js/issues/2203
                /* c8 ignore next */
                spreadNode.arguments?.map((arg) => arg.name.value));
                for (const [varName, variableDefinition,] of fragmentSignature.variableDefinitions) {
                    if (!providedArgs.has(varName) &&
                        isRequiredArgumentNode(variableDefinition)) {
                        const type = typeFromAST(context.getSchema(), variableDefinition.type);
                        const argTypeStr = inspect(type);
                        context.reportError(new GraphQLError(`Fragment "${spreadNode.name.value}" argument "${varName}" of type "${argTypeStr}" is required, but it was not provided.`, { nodes: spreadNode }));
                    }
                }
            },
        },
    };
}
/**
 * @internal
 */
export function ProvidedRequiredArgumentsOnDirectivesRule(context) {
    const requiredArgsMap = new Map();
    const schema = context.getSchema();
    const definedDirectives = schema?.getDirectives() ?? specifiedDirectives;
    for (const directive of definedDirectives) {
        requiredArgsMap.set(directive.name, new Map(directive.args.filter(isRequiredArgument).map((arg) => [arg.name, arg])));
    }
    const astDefinitions = context.getDocument().definitions;
    for (const def of astDefinitions) {
        if (def.kind === Kind.DIRECTIVE_DEFINITION) {
            // FIXME: https://github.com/graphql/graphql-js/issues/2203
            /* c8 ignore next */
            const argNodes = def.arguments ?? [];
            requiredArgsMap.set(def.name.value, new Map(argNodes
                .filter(isRequiredArgumentNode)
                .map((arg) => [arg.name.value, arg])));
        }
    }
    return {
        Directive: {
            // Validate on leave to allow for deeper errors to appear first.
            leave(directiveNode) {
                const directiveName = directiveNode.name.value;
                const requiredArgs = requiredArgsMap.get(directiveName);
                if (requiredArgs != null) {
                    // FIXME: https://github.com/graphql/graphql-js/issues/2203
                    /* c8 ignore next */
                    const argNodes = directiveNode.arguments ?? [];
                    const argNodeMap = new Set(argNodes.map((arg) => arg.name.value));
                    for (const [argName, argDef] of requiredArgs.entries()) {
                        if (!argNodeMap.has(argName)) {
                            const argType = isType(argDef.type)
                                ? inspect(argDef.type)
                                : print(argDef.type);
                            context.reportError(new GraphQLError(`Argument "@${directiveName}(${argName}:)" of type "${argType}" is required, but it was not provided.`, { nodes: directiveNode }));
                        }
                    }
                }
            },
        },
    };
}
function isRequiredArgumentNode(arg) {
    return arg.type.kind === Kind.NON_NULL_TYPE && arg.defaultValue == null;
}