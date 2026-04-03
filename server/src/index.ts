import { app } from './app.js';
import { connect } from './controllers/platformController.js';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`[server] Migration Estimator API running on http://localhost:${PORT}`);
  autoConnect();
});

async function autoConnect() {
  const {
    VMWARE_ENDPOINT, VMWARE_USERNAME, VMWARE_PASSWORD,
    OPENSHIFT_ENDPOINT, OPENSHIFT_TOKEN,
    FLASHARRAY_ENDPOINT, FLASHARRAY_API_TOKEN,
  } = process.env;

  if (VMWARE_ENDPOINT && VMWARE_USERNAME && VMWARE_PASSWORD) {
    connect('vmware', VMWARE_ENDPOINT, { username: VMWARE_USERNAME, password: VMWARE_PASSWORD })
      .then((c) => console.log(`[server] VMware: ${c.status}${c.errorMessage ? ` – ${c.errorMessage}` : ''}`))
      .catch(() => {});
  }

  if (OPENSHIFT_ENDPOINT && OPENSHIFT_TOKEN) {
    connect('openshift', OPENSHIFT_ENDPOINT, { token: OPENSHIFT_TOKEN })
      .then((c) => console.log(`[server] OpenShift: ${c.status}${c.errorMessage ? ` – ${c.errorMessage}` : ''}`))
      .catch(() => {});
  }

  if (FLASHARRAY_ENDPOINT && FLASHARRAY_API_TOKEN) {
    connect('flasharray', FLASHARRAY_ENDPOINT, { apiToken: FLASHARRAY_API_TOKEN })
      .then((c) => console.log(`[server] FlashArray: ${c.status}${c.errorMessage ? ` – ${c.errorMessage}` : ''}`))
      .catch(() => {});
  }
}
