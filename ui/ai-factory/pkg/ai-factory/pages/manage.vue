<template>
  <div class="aif-wizard">
    <h1>{{ t('aif.pages.wizards.manage.title', { name: workloadName }) }}</h1>

    <div v-if="loading" class="aif-wizard__loading">
      <Loading />
    </div>

    <template v-else>
      <div v-if="fetchError" class="aif-wizard__error">
        {{ t('aif.pages.wizards.manage.fetchError', { message: fetchError.message }) }}
      </div>

      <template v-else>
        <div class="aif-wizard__step">
          <label>
            {{ t('aif.pages.wizards.manage.chartVersion') }}
            <input v-model="form.chartVersion" type="text" class="input" />
          </label>
          <label>{{ t('aif.pages.wizards.manage.helmValues') }}</label>
          <textarea v-model="form.valuesYaml" class="aif-wizard__yaml-editor" rows="16" />
        </div>

        <div class="aif-wizard__nav">
          <button class="btn role-secondary" @click="cancel">
            {{ t('aif.pages.wizards.manage.cancel') }}
          </button>
          <button class="btn role-primary" :disabled="applying" @click="applyChanges">
            {{ applying ? t('aif.pages.wizards.manage.applying') : t('aif.pages.wizards.manage.apply') }}
          </button>
        </div>

        <div v-if="applyError" class="aif-wizard__error">{{ applyError.message }}</div>
        <div v-if="applySuccess" class="aif-wizard__success">{{ t('aif.pages.wizards.manage.applySuccess') }}</div>
      </template>
    </template>
  </div>
</template>

<script>
import { defineComponent } from 'vue';
import Loading from '@shell/components/Loading';
import { getWorkload, putWorkload } from '../utils/operator-api';
import { PRODUCT_NAME, MANAGEMENT_CLUSTER, PAGE_IDS } from '../config/types';

export default defineComponent({
  name: 'ManagePage',

  components: { Loading },

  async fetch() {
    this.loading = true;
    try {
      const wl = await getWorkload(this.$route.params.ns, this.$route.params.name);

      this.workload = wl;
      this.form.chartVersion = wl.spec?.source?.app?.version || '';
      // App workloads key valueOverrides by the workload name (deployer.go:
      // desiredComponent.name = req.SpecName). The install wizard wrote the
      // full effective values under that key, so manage shows them verbatim.
      const overrides = wl.spec?.valueOverrides || {};

      this.form.valuesYaml = overrides[this.$route.params.name] ?? Object.values(overrides)[0] ?? '';
    } catch (e) {
      this.fetchError = e;
    } finally {
      this.loading = false;
    }
  },

  data() {
    return {
      workload:     null,
      loading:      true,
      fetchError:   null,
      applying:     false,
      applyError:   null,
      applySuccess: false,
      form:         {
        chartVersion: '',
        valuesYaml:   '',
      },
    };
  },

  computed: {
    workloadName() {
      return this.$route.params.name;
    },
  },

  methods: {
    cancel() {
      this.$router.push({
        name:   `${ PRODUCT_NAME }-c-cluster-${ PAGE_IDS.WORKLOADS }`,
        params: { cluster: MANAGEMENT_CLUSTER },
      });
    },

    async applyChanges() {
      this.applying = true;
      this.applyError = null;
      this.applySuccess = false;
      try {
        // Deep-clone so we don't mutate the Vue-reactive original.
        const spec = JSON.parse(JSON.stringify(this.workload?.spec || {}));

        if (spec.source?.app) {
          spec.source.app.version = this.form.chartVersion;
        }
        // Key by the workload name to match the deployer's App component name.
        spec.valueOverrides = { [this.$route.params.name]: this.form.valuesYaml };
        await putWorkload(this.$route.params.ns, this.$route.params.name, spec);
        this.applySuccess = true;
      } catch (e) {
        this.applyError = e;
      } finally {
        this.applying = false;
      }
    },
  },
});
</script>

<style scoped>
.aif-wizard {
  max-width: 720px;
  padding: 24px;
}

.aif-wizard__step {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
}

.aif-wizard__yaml-editor {
  width: 100%;
  font-family: monospace;
  font-size: 0.85rem;
}

.aif-wizard__nav {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.aif-wizard__error {
  color: var(--error);
  margin-top: 12px;
}

.aif-wizard__success {
  color: var(--success);
  margin-top: 12px;
}
</style>
