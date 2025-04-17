<template>
  <div class="relative group flex items-center" @click.stop>
    <!-- Normal value display -->
    <div v-if="!isEditing" class="flex items-center">
      <ValueRenderer :column="column" :record="record" />
      <button 
        v-if="!column.editReadonly"
        @click="startEdit"
        class="ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <IconPenSolid class="w-5 h-5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"/>
      </button>
    </div>

    <!-- Edit mode -->
    <div v-else class="flex items-center min-w-full max-w-full gap-2">
      <ColumnValueInputWrapper
        ref="input"
        :source="'edit'"
        :column="column"
        :currentValues="currentValues"
        :mode="mode"
        :columnOptions="columnOptions"
        :unmasked="unmasked"
        :setCurrentValue="setCurrentValue"
      />
      <div class="flex gap-1">
        <button 
          @click="saveEdit"
          :disabled="saving"
          class="text-green-600 hover:text-green-700 dark:text-green-500 dark:hover:text-green-400"
        >
          <IconCheckOutline class="w-5 h-5" />
        </button>
        <button 
          @click="cancelEdit"
          :disabled="saving"
          class="text-red-600 hover:text-red-700 dark:text-red-500 dark:hover:text-red-400"
        >
          <IconXOutline class="w-5 h-5" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { IconPenSolid, IconCheckOutline, IconXOutline } from '@iconify-prerendered/vue-flowbite';
import { callAdminForthApi } from '@/utils';
import { showErrorTost, showSuccesTost } from '@/composables/useFrontendApi';
import ValueRenderer from '@/components/ValueRenderer.vue';
import ColumnValueInputWrapper from '@/components/ColumnValueInputWrapper.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const props = defineProps(['column', 'record', 'resource', 'adminUser', 'meta']);
const isEditing = ref(false);
const editValue = ref(null);
const saving = ref(false);
const input = ref(null);
const columnOptions = ref({});
const mode = ref('edit');
const currentValues = ref({});
const unmasked = ref({});

function startEdit() {
  const value = props.record[props.column.name];
  currentValues.value = {
    [props.column.name]: props.column.isArray?.enabled 
      ? (Array.isArray(value) ? value : [value]).filter(v => v !== null && v !== undefined)
      : value
  };
  isEditing.value = true;
}

function cancelEdit() {
  isEditing.value = false;
  editValue.value = null;
}

function setCurrentValue(field, value, arrayIndex = undefined) {
  if (arrayIndex !== undefined && props.column.isArray?.enabled) {
    // Handle array updates
    if (!Array.isArray(currentValues.value[field])) {
      currentValues.value[field] = [];
    }
    
    const newArray = [...currentValues.value[field]];
    
    if (arrayIndex >= newArray.length) {
      // When adding a new item, always add null
      newArray.push(null);
    } else {
      // For existing items, handle type conversion
      if (props.column.isArray?.itemType && ['integer', 'float', 'decimal'].includes(props.column.isArray.itemType)) {
        newArray[arrayIndex] = value !== null && value !== '' ? +value : null;
      } else {
        newArray[arrayIndex] = value;
      }
    }
    
    // Assign the new array
    currentValues.value[field] = newArray;
    editValue.value = newArray;
  } else {
    // Handle non-array updates
    currentValues.value[field] = value;
    editValue.value = value;
  }
}

async function saveEdit() {
  saving.value = true;
  try {
    const result = await callAdminForthApi({
      method: 'POST',
      path: `/plugin/${props.meta.pluginInstanceId}/update-field`,
      body: {
        resourceId: props.resource.resourceId,
        recordId: props.record._primaryKeyValue,
        field: props.column.name,
        value: currentValues.value[props.column.name]
      }
    });

    if (result.error) {
      showErrorTost(result.error);
      return;
    }

    showSuccesTost(t('Field updated successfully'));
    props.record[props.column.name] = currentValues.value[props.column.name];
    isEditing.value = false;
  } finally {
    saving.value = false;
  }
}
</script>
