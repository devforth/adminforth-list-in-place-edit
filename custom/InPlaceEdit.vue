<template>
  <div class="relative group flex items-center" @click.stop>
    <!-- Normal value display -->
    <div v-if="!isEditing" class="flex items-center">
      <ValueRenderer :column="column" :record="record" />
      <Button
        v-if="!column.editReadonly"
        @click="startEdit"
        variant="ghost"
        size="sm"
        iconOnly
        class="ml-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition"
      >
        <IconPencil />
      </Button>
    </div>

    <!-- Edit mode -->
    <div v-else class="flex items-center gap-2 min-w-[200px] w-full">
      <ColumnValueInputWrapper
        ref="input"
        class="flex-grow w-full"
        :source="'edit'"
        :column="column"
        :currentValues="currentValues"
        :mode="mode"
        :columnOptions="columnOptions"
        :unmasked="unmasked"
        :setCurrentValue="setCurrentValue"
      />
      <div class="flex gap-1">
        <Button
          @click="saveEdit"
          :disabled="!isChanged || saving"
          :loader="saving"
          iconOnly
        >
          <IconCheck />
        </Button>
        <Button
          @click="cancelEdit"
          :disabled="saving"
          variant="secondary"
          iconOnly
        >
          <IconX />
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { IconPencil, IconCheck, IconX } from '@iconify-prerendered/vue-lucide';
import { Button } from '@/afcl';
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
const isChanged = computed(() => {
  const original = props.record[props.column.name];
  const current = currentValues.value[props.column.name];

  return JSON.stringify(original) !== JSON.stringify(current);
});

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
