import { print } from "recast";
import { ASTNode, builders, namedTypes } from "ast-types";
import { Module, Entity, EntityField } from "../../../types";
import { readFile, relativeImportPath } from "../../../util/module";
import {
  interpolate,
  removeTSIgnoreComments,
  removeTSVariableDeclares,
  removeTSInterfaceDeclares,
  addImports,
  removeTSClassDeclares,
  importNames,
  getClassDeclarationById,
  removeESLintComments,
  memberExpression,
  awaitExpression,
  logicalExpression,
  addIdentifierToConstructorSuperCall,
} from "../../../util/ast";
import { addInjectableDependency } from "../../../util/nestjs-code-generation";
import { isPasswordField } from "../../../util/field";
import { SRC_DIRECTORY } from "../../constants";

const ARGS_ID = builders.identifier("args");
const DATA_ID = builders.identifier("data");
const PASSWORD_SERVICE_ID = builders.identifier("PasswordService");
const PASSWORD_SERVICE_MEMBER_ID = builders.identifier("passwordService");
const PASSWORD_SERVICE_MODULE_PATH = `${SRC_DIRECTORY}/auth/password.service.ts`;
const HASH_MEMBER_EXPRESSION = memberExpression`this.${PASSWORD_SERVICE_MEMBER_ID}.hash`;
const TRANSFORM_STRING_FIELD_UPDATE_INPUT_ID = builders.identifier(
  "transformStringFieldUpdateInput"
);
const PRISMA_UTIL_MODULE_PATH = `${SRC_DIRECTORY}/prisma.util.ts`;
const serviceTemplatePath = require.resolve("./service.template.ts");
const serviceBaseTemplatePath = require.resolve("./service.base.template.ts");
const PASSWORD_FIELD_ASYNC_METHODS = new Set(["create", "update"]);

export async function createServiceModules(
  entityName: string,
  entityType: string,
  entity: Entity
): Promise<Module[]> {
  const serviceId = createServiceId(entityType);
  const serviceBaseId = createServiceBaseId(entityType);
  const delegateId = builders.identifier(entityName);
  const passwordFields = entity.fields.filter(isPasswordField);

  const mapping = {
    SERVICE: serviceId,
    SERVICE_BASE: serviceBaseId,
    ENTITY: builders.identifier(entityType),
    FIND_MANY_ARGS: builders.identifier(`FindMany${entityType}Args`),
    FIND_ONE_ARGS: builders.identifier(`FindOne${entityType}Args`),
    CREATE_ARGS: builders.identifier(`${entityType}CreateArgs`),
    UPDATE_ARGS: builders.identifier(`${entityType}UpdateArgs`),
    DELETE_ARGS: builders.identifier(`${entityType}DeleteArgs`),
    DELEGATE: delegateId,
    CREATE_ARGS_MAPPING: createMutationDataMapping(
      passwordFields.map((field) => {
        const fieldId = builders.identifier(field.name);
        return builders.objectProperty(
          fieldId,
          awaitExpression`await ${HASH_MEMBER_EXPRESSION}(${ARGS_ID}.${DATA_ID}.${fieldId})`
        );
      })
    ),
    UPDATE_ARGS_MAPPING: createMutationDataMapping(
      passwordFields.map((field) => {
        const fieldId = builders.identifier(field.name);
        const valueMemberExpression = memberExpression`${ARGS_ID}.${DATA_ID}.${fieldId}`;
        return builders.objectProperty(
          fieldId,
          logicalExpression`${valueMemberExpression} && await ${TRANSFORM_STRING_FIELD_UPDATE_INPUT_ID}(
            ${ARGS_ID}.${DATA_ID}.${fieldId},
            (password) => ${HASH_MEMBER_EXPRESSION}(password)
          )`
        );
      })
    ),
  };
  return [
    await createServiceModule(
      entityName,
      mapping,
      passwordFields,
      serviceId,
      serviceBaseId
    ),
    await createServiceBaseModule(
      entityName,
      mapping,
      passwordFields,
      serviceId,
      serviceBaseId
    ),
  ];
}

async function createServiceModule(
  entityName: string,
  mapping: { [key: string]: ASTNode | undefined },
  passwordFields: EntityField[],
  serviceId: namedTypes.Identifier,
  serviceBaseId: namedTypes.Identifier
): Promise<Module> {
  const modulePath = `${SRC_DIRECTORY}/${entityName}/${entityName}.service.ts`;
  const moduleBasePath = `${SRC_DIRECTORY}/${entityName}/base/${entityName}.service.base.ts`;
  const file = await readFile(serviceTemplatePath);

  interpolate(file, mapping);
  removeTSClassDeclares(file);

  //add import to base class
  addImports(file, [
    importNames(
      [serviceBaseId],
      relativeImportPath(modulePath, moduleBasePath)
    ),
  ]);

  //if there are any password fields, add imports, injection, and pass service to super
  if (passwordFields.length) {
    const classDeclaration = getClassDeclarationById(file, serviceId);

    addInjectableDependency(
      classDeclaration,
      PASSWORD_SERVICE_MEMBER_ID.name,
      PASSWORD_SERVICE_ID,
      "protected"
    );

    addIdentifierToConstructorSuperCall(file, PASSWORD_SERVICE_MEMBER_ID);

    for (const member of classDeclaration.body.body) {
      if (
        namedTypes.ClassMethod.check(member) &&
        namedTypes.Identifier.check(member.key) &&
        PASSWORD_FIELD_ASYNC_METHODS.has(member.key.name)
      ) {
        member.async = true;
      }
    }
    //add the password service
    addImports(file, [
      importNames(
        [PASSWORD_SERVICE_ID],
        relativeImportPath(modulePath, PASSWORD_SERVICE_MODULE_PATH)
      ),
    ]);
  }

  removeTSIgnoreComments(file);
  removeESLintComments(file);
  removeTSVariableDeclares(file);
  removeTSInterfaceDeclares(file);

  return {
    path: modulePath,
    code: print(file).code,
  };
}

async function createServiceBaseModule(
  entityName: string,
  mapping: { [key: string]: ASTNode | undefined },
  passwordFields: EntityField[],
  serviceId: namedTypes.Identifier,
  serviceBaseId: namedTypes.Identifier
): Promise<Module> {
  const moduleBasePath = `${SRC_DIRECTORY}/${entityName}/base/${entityName}.service.base.ts`;
  const file = await readFile(serviceBaseTemplatePath);

  interpolate(file, mapping);
  removeTSClassDeclares(file);

  if (passwordFields.length) {
    const classDeclaration = getClassDeclarationById(file, serviceBaseId);

    addInjectableDependency(
      classDeclaration,
      PASSWORD_SERVICE_MEMBER_ID.name,
      PASSWORD_SERVICE_ID,
      "protected"
    );

    for (const member of classDeclaration.body.body) {
      if (
        namedTypes.ClassMethod.check(member) &&
        namedTypes.Identifier.check(member.key) &&
        PASSWORD_FIELD_ASYNC_METHODS.has(member.key.name)
      ) {
        member.async = true;
      }
    }
    //add the password service
    addImports(file, [
      importNames(
        [PASSWORD_SERVICE_ID],
        relativeImportPath(moduleBasePath, PASSWORD_SERVICE_MODULE_PATH)
      ),
    ]);

    addImports(file, [
      importNames(
        [TRANSFORM_STRING_FIELD_UPDATE_INPUT_ID],
        relativeImportPath(moduleBasePath, PRISMA_UTIL_MODULE_PATH)
      ),
    ]);
  }

  removeTSIgnoreComments(file);
  removeESLintComments(file);
  removeTSVariableDeclares(file);
  removeTSInterfaceDeclares(file);

  return {
    path: moduleBasePath,
    code: print(file).code,
  };
}

function createMutationDataMapping(
  mappings: namedTypes.ObjectProperty[]
): namedTypes.Identifier | namedTypes.ObjectExpression {
  if (!mappings.length) {
    return ARGS_ID;
  }
  return builders.objectExpression([
    builders.spreadProperty(ARGS_ID),
    builders.objectProperty(
      DATA_ID,
      builders.objectExpression([
        builders.spreadProperty(memberExpression`${ARGS_ID}.${DATA_ID}`),
        ...mappings,
      ])
    ),
  ]);
}

export function createServiceId(entityType: string): namedTypes.Identifier {
  return builders.identifier(`${entityType}Service`);
}

export function createServiceBaseId(entityType: string): namedTypes.Identifier {
  return builders.identifier(`${entityType}ServiceBase`);
}
