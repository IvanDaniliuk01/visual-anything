/** The recipe for Kubernetes manifests: workloads inside their namespaces, and who calls whom. */
import type { Recipe } from './recipe';

const INPUT = `apiVersion: v1
kind: Namespace
metadata:
  name: shop
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders
  namespace: shop
spec:
  replicas: 3
  selector:
    matchLabels: { app: orders }
  template:
    metadata:
      labels: { app: orders }
    spec:
      containers:
        - name: orders
          image: ghcr.io/shop/orders:1.4.0
          env:
            - name: PAYMENTS_URL
              value: http://payments.shop.svc.cluster.local
---
apiVersion: v1
kind: Service
metadata:
  name: payments
  namespace: shop
spec:
  selector: { app: payments }
  ports:
    - port: 80
      targetPort: 8080
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payments
  namespace: shop
spec:
  replicas: 2
  selector:
    matchLabels: { app: payments }
  template:
    metadata:
      labels: { app: payments }
    spec:
      containers:
        - name: payments
          image: ghcr.io/shop/payments:2.0.1
---
apiVersion: v1
kind: Secret
metadata:
  name: payments-keys
  namespace: shop
stringData:
  apiKey: replace-me
`;

export const KUBERNETES: Recipe = {
  name: 'build_from_kubernetes',
  material: 'Kubernetes manifests',
  title: 'Build from Kubernetes',
  description:
    'Build the workloads Kubernetes manifests run, inside their namespaces, and which workload calls which.',
  read: [
    'Manifests are YAML with `apiVersion` and `kind`, often several to a file between `---` lines. For a Helm chart or a Kustomize overlay, read what it renders to (`helm template`, `kubectl kustomize`), which you or the person make first: its templates are not manifests.',
    'A `Secret`’s `data` and `stringData` are never copied, and a `ConfigMap`’s values only to see which service an address names.',
  ],
  mapping: [
    {
      from: 'A `Namespace`, or the `metadata.namespace` objects share',
      to: 'a `systems.system` holding what runs in it, through `systems.is-part-of`',
    },
    {
      from: 'A `Deployment`, `StatefulSet`, `DaemonSet`, `Job` or `CronJob`',
      to: 'an element named by its `metadata.name`: a `systems.database` when its image is a database (postgres, mysql, mongo, redis), with `engine`; otherwise a `systems.service`. Its image becomes `technology`, and `replicas` and a CronJob’s `schedule` attributes of the same names',
    },
    {
      from: 'A `Service` of Kubernetes',
      to: 'not an element of its own, since it is how a workload is reached: find the workloads its `selector` matches, and give them its `ports` (`80 → 8080`) and its `type` when it is not ClusterIP',
    },
    {
      from: 'An address in a container’s `env`, or in a `ConfigMap`, that names a Service (`http://payments`, `payments.shop.svc.cluster.local`, `postgres://db:5432`)',
      to: 'a `systems.communicates-with` from the workload to the workloads behind that Service, with `protocol` from the address’s scheme',
    },
    {
      from: 'An `Ingress`, or a Gateway API `HTTPRoute`',
      to: 'a `systems.service` named by it, which `systems.communicates-with` each workload its rules reach through their Services, named by the host and path (`shop.example.com/api`), with `protocol` HTTPS when it has `tls`, otherwise HTTP',
    },
    {
      from: 'A `HorizontalPodAutoscaler`',
      to: 'the `minReplicas` and `maxReplicas` attributes of the workload it scales',
    },
    {
      from: 'A `NetworkPolicy`',
      to: 'nothing: it says which calls are allowed, not which happen. Report it, and offer to compare it with the relations',
    },
  ],
  views: [
    'One view of the cluster, perspective "Deployment", arranged by `systems.is-part-of`, with namespaces holding their workloads; for several clusters, a `systems.system` per cluster holding its namespaces.',
  ],
  scenarios: [
    'Manifests hold no sequence. Offer a scenario from `kubectl logs` or traces of one request (the logs and traces recipe).',
  ],
  unmatched: [
    'Secrets, whose values are never copied.',
    'Roles, RoleBindings and ServiceAccounts; PodDisruptionBudgets; resource requests and limits; probes.',
    'PersistentVolumeClaims: offer them as an attribute of the workload that mounts them.',
    'Custom resources whose meaning you cannot tell: ask.',
  ],
  example: {
    file: 'k8s/shop.yaml',
    input: INPUT,
    calls: [
      { tool: 'get_project', why: 'See what the project uses and holds.', args: {} },
      {
        tool: 'add_to_model',
        why: 'The namespace holds both workloads. The payments Service is how orders reaches payments, so it gives payments its ports rather than an element of its own.',
        args: {
          label: 'Import the shop namespace from k8s/shop.yaml',
          elements: [
            { ref: 'shop', component: 'systems.system', name: 'shop' },
            {
              ref: 'orders',
              component: 'systems.service',
              name: 'orders',
              inside: ['shop'],
              attributes: { technology: 'ghcr.io/shop/orders:1.4.0', replicas: 3 },
            },
            {
              ref: 'payments',
              component: 'systems.service',
              name: 'payments',
              inside: ['shop'],
              attributes: {
                technology: 'ghcr.io/shop/payments:2.0.1',
                replicas: 2,
                ports: '80 → 8080',
              },
            },
          ],
          relations: [
            {
              relationType: 'systems.communicates-with',
              from: 'orders',
              to: 'payments',
              attributes: { protocol: 'HTTP' },
            },
          ],
        },
      },
      {
        tool: 'create_view',
        why: 'A view of the cluster.',
        args: {
          name: 'Shop cluster',
          perspective: { name: 'Deployment', description: 'What runs in the shop namespace.' },
          nestingRelationTypes: ['systems.is-part-of'],
        },
      },
    ],
    leftOut: [
      {
        quote: 'name: payments-keys',
        why: 'a Secret: its values are never copied into the project',
      },
    ],
  },
};
