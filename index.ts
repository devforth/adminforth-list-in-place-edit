import { AdminForthPlugin } from "adminforth";
import type { IAdminForth, IHttpServer, AdminForthResourcePages, AdminForthResourceColumn, AdminForthDataTypes, AdminForthResource } from "adminforth";
import type { PluginOptions } from './types.js';

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
      if (column.components?.list) {
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
      handler: async ({ body, adminUser }) => {
        const { resourceId, recordId, field, value } = body;

        const resource = this.adminforth.config.resources.find(r => r.resourceId === resourceId);
        // Create update object with just the single field
        const updateRecord = { [field]: value };
        
        // Use AdminForth's built-in update method
        const connector = this.adminforth.connectors[resource.dataSource];
        const oldRecord = await connector.getRecordByPrimaryKey(resource, recordId)
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

        const updatedRecord = await connector.getRecordByPrimaryKey(resource, recordId);
        return { record: updatedRecord };
      }
    });
  }
}