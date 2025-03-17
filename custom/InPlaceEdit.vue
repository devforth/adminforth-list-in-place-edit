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
      <template v-if="column.isArray?.enabled">
        <ArrayColumnValueInput
          ref="input"
          :source="source"
          :column="column"
          :value="editValue"
          :currentValues="record"
          :mode="mode"
          :columnOptions="columnOptions"
          :unmasked="{}"
          @update:modelValue="editValue = $event"
        />
      </template>
      <ColumnValueInput
        v-else
        ref="input"
        :column="column"
        :value="editValue"
        @update:modelValue="editValue = $event"
        source="edit"
        mode="edit"
        :currentValues="record"
        :columnOptions="columnOptions"
        :unmasked="{}"
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
import ColumnValueInput from '@/components/ColumnValueInput.vue';
import ArrayColumnValueInput from '@/components/ArrayColumnValueInput.vue';

const props = defineProps(['column', 'record', 'resource', 'adminUser', 'meta']);
const isEditing = ref(false);
const editValue = ref(null);
const saving = ref(false);
const input = ref(null);
const columnOptions = ref({});
const mode = ref('edit');

function startEdit() {
  editValue.value = props.column.isArray?.enabled 
    ? [...(props.record[props.column.name] || [])]
    : props.record[props.column.name];
  isEditing.value = true;
  // Focus input after render
  setTimeout(() => {
    input.value?.focus();
  }, 0);
}

function cancelEdit() {
  isEditing.value = false;
  editValue.value = null;
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
        value: editValue.value
      }
    });

    if (result.error) {
      showErrorTost(result.error);
      return;
    }

    showSuccesTost('Field updated successfully');
    props.record[props.column.name] = editValue.value;
    isEditing.value = false;
  } finally {
    saving.value = false;
  }
}
</script>
