import { AdminForthPlugin, interpretResource, ActionCheckSource, AllowedActionsEnum } from "adminforth";
import type { IAdminForth, IHttpServer, AdminForthResourcePages, AdminForthResourceColumn, AdminForthDataTypes, AdminForthResource } from "adminforth";
import type { PluginOptions } from './types.js';
import { z } from "zod";

const updateFieldBodySchema = z.object({
  resourceId: z.string(),
  recordId: z.union([z.string(), z.number()]),
  field: z.string(),
  value: z.unknown(),
}).strict();

export default class ListInPlaceEditPlugin extends AdminForthPlugin {
  options: PluginOptions;

  constructor(options: PluginOptions) {
    super(options, import.meta.url);
    this.options = options;
  }

  private parseBody<T>(
    schema: z.ZodType<T>,
    body: unknown,
    response: { setStatus: (code: number, message: string) => void },
  ): T | null {
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      response.setStatus(422, parsed.error.message);
      return null;
    }
    return parsed.data;
  }

  async modifyResourceConfig(adminforth: IAdminForth, resourceConfig: AdminForthResource) {
    super.modifyResourceConfig(adminforth, resourceConfig);

    const targetColumns = resourceConfig.columns.filter(col => 
      this.options.columns.includes(col.name)
    );

    targetColumns.forEach(column => {
      if (column.components?.list && (typeof column.components.list === 'object' && column.components.list.file !== this.componentPath('InPlaceEdit.vue'))) {
        throw new Error(`Column ${column.name} already has a list component defined. ListInplaceEdit plugin cannot be used on columns that already have list components.`);
      }
      
      if (!column.components) {
        column.components = {};
      }
      column.components.list = {
        file: this.componentPath('InPlaceEdit.vue'),
        meta: {
          pluginInstanceId: this.pluginInstanceId,
          columnName: column.name
        }
      };
    });
  }

  validateConfigAfterDiscover(adminforth: IAdminForth, resourceConfig: AdminForthResource) {
    // Validate that columns exist if specific columns were specified
    this.options.columns.forEach(colName => {
      if (!resourceConfig.columns.find(c => c.name === colName)) {
        throw new Error(`Column ${colName} specified in ListInplaceEdit plugin not found in resource ${resourceConfig.label}`);
      }
    });
  }

  instanceUniqueRepresentation(pluginOptions: any): string {
    return 'single';
  }

  setupEndpoints(server: IHttpServer) {
    // Add endpoint to update single field
    server.endpoint({
      method: 'POST',
      path: `/plugin/${this.pluginInstanceId}/update-field`,
      handler: async ({ body, adminUser, response }) => {
        const data = this.parseBody(updateFieldBodySchema, body, response);
        if (!data) return;
        const { resourceId, recordId, field, value } = data;
        if (this.resourceConfig.resourceId !== resourceId) {
          return { error: 'Resource ID mismatch' };
        }
        if (!this.options.columns.includes(field)) {
          return { error: 'Field not allowed to be edited' };
        }
        const resource = this.adminforth.config.resources.find(r => r.resourceId === resourceId);
        if (!resource) {
          return { error: `Resource '${resourceId}' not found` };
        }
        const column = resource.columns.find(c => c.name === field);
        if (!column) {
          return { error: 'Field not allowed to be edited' };
        }
        if (column.primaryKey) {
          return { error: 'Primary key field cannot be edited' };
        }
        if (column.backendOnly === true) {
          return { error: 'Field is not editable, because it is marked as backendOnly' };
        }
        if (column.editReadonly === true) {
          return { error: 'Field is not editable, because it is marked as editReadonly' };
        }
        // Create update object with just the single field
        const updateRecord = { [field]: value };

        // Use AdminForth's built-in update method
        const connector = this.adminforth.connectors[resource.dataSource];
        const oldRecord = await connector.getRecordByPrimaryKey(resource, recordId as string)
        if (!oldRecord) {
          return { error: 'Record not found' };
        }

        // Enforce the resource's edit permission for this specific record
        // (mirrors the core /update_record access check, since updateResourceRecord does not check ACL).
        const { allowedActions } = await interpretResource(
          adminUser,
          resource,
          { requestBody: body, newRecord: updateRecord, oldRecord, pk: recordId },
          ActionCheckSource.EditRequest,
          this.adminforth
        );
        const editAllowed = allowedActions[AllowedActionsEnum.edit] as boolean | string | undefined;
        if (editAllowed !== true) {
          return { error: typeof editAllowed === 'string' ? editAllowed : 'You do not have permission to edit this record' };
        }

        const result = await this.adminforth.updateResourceRecord({
          resource,
          recordId,
          record: updateRecord,
          oldRecord,
          adminUser
        });

        if (result.error) {
          return { error: result.error };
        }

        const updatedRecord = await connector.getRecordByPrimaryKey(resource, recordId as string);
        return { record: updatedRecord };
      }
    });
  }
}