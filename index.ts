import { AdminForthPlugin } from "adminforth";
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
      // the column is edited right in the list, so it stays writable even when the edit form hides it
      column.allowModifyWhenNotShowInEdit = true;
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
      agent: { hiddenFromAgents: true },
      request_schema: updateFieldBodySchema,
      handler: async ({ body, adminUser, query, headers, cookies, requestUrl, response }) => {
        const data = body as z.infer<typeof updateFieldBodySchema>;
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

        // the edit permission, the row scope and the column rules are enforced by asUser().update()
        const result = await this.adminforth.resource(resourceId)
          .asUser(adminUser, {
            meta: { requestBody: body },
            extra: { body, query, headers, cookies, requestUrl, response },
          })
          .update(recordId, { [field]: value });

        if (result.error) {
          return { error: result.error };
        }

        return { ok: true };
      }
    });
  }
}