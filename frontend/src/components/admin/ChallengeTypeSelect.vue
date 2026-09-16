<script setup lang="ts">
import { NSelect } from "naive-ui";
import { challengeTypes, type ChallengeType } from "@shared/types";

const value = defineModel<ChallengeType>({ required: true });
const options = challengeTypes.map(type => ({ value: type, label: type }));
</script>

<template>
  <NSelect to="body" v-model:value="value" :options="options" placeholder="请选择挑战类型" aria-label="挑战类型" />
</template>
