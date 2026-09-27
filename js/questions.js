// questions.js — static copy for the wizard: step titles, explanations, and the
// "what this means / example" content shown behind every ⓘ icon.
// Kept separate from ui.js so copy can be edited without touching rendering logic.

export const STEPS = [
  { key: 'workspace', number: 1, title: 'Workspace', short: 'Basic information about this architecture model.' },
  { key: 'people', number: 2, title: 'People', short: 'Who interacts with your software system?' },
  { key: 'softwareSystems', number: 3, title: 'Software Systems', short: 'What software systems are involved in this architecture?' },
  { key: 'relationships', number: 4, title: 'Relationships', short: 'How do people and software systems interact?' },
  { key: 'containers', number: 5, title: 'Containers', short: 'Optional: decompose a software system into containers.', optional: true },
  { key: 'containerRelationships', number: 6, title: 'Container Relationships', short: 'How do the containers communicate with each other?', optional: true },
  { key: 'components', number: 7, title: 'Components', short: 'Optional: decompose a container into components.', optional: true },
  { key: 'componentRelationships', number: 8, title: 'Component Relationships', short: 'How do the components collaborate?', optional: true },
  { key: 'scenarios', number: 9, title: 'Dynamic Scenarios', short: 'Optional: describe an important scenario as a sequence.', optional: true },
  { key: 'deployment', number: 10, title: 'Deployment', short: 'Optional: describe where the software is deployed.', optional: true },
  { key: 'views', number: 11, title: 'Views Configuration', short: 'Choose which Structurizr views to generate.' },
  { key: 'validate', number: 12, title: 'Validate & Generate', short: 'Check completeness and generate the Structurizr DSL.' }
];

export const HELP = {
  workspaceName: {
    means: 'The name of the overall Structurizr workspace — usually the name of the system or platform being modelled.',
    example: 'Order Management Platform'
  },
  workspaceDescription: {
    means: 'Describe the primary purpose of the system from a business perspective.',
    example: 'Manages customer orders from creation through fulfilment.'
  },
  workspaceAuthor: {
    means: 'Who is authoring this architecture model (optional, for reference only).',
    example: 'Niranjan Rath'
  },
  workspaceTags: {
    means: 'Optional comma-separated tags or properties for the workspace.',
    example: 'ecommerce, order, example'
  },
  personName: {
    means: 'The name of a person, role, or actor who interacts with the software.',
    example: 'Customer'
  },
  personDescription: {
    means: 'What this person does in relation to the system.',
    example: 'Places and tracks orders.'
  },
  systemName: {
    means: 'The name of a software system involved in this architecture.',
    example: 'Payment Gateway'
  },
  systemDescription: {
    means: 'What this software system does.',
    example: 'Processes customer payments.'
  },
  systemType: {
    means: 'Whether this system is the one you are documenting (Internal) or an external dependency (External).',
    example: 'External'
  },
  relationshipFrom: {
    means: 'The person or software system where the interaction originates.',
    example: 'Customer'
  },
  relationshipTo: {
    means: 'The person or software system receiving the interaction.',
    example: 'Order Management Platform'
  },
  relationshipDescription: {
    means: 'A short description of the interaction, from the perspective of the source.',
    example: 'Places orders'
  },
  relationshipTechnology: {
    means: 'Optional: the protocol or technology used for this interaction.',
    example: 'HTTPS'
  },
  containerParent: {
    means: 'Which software system this container belongs to.',
    example: 'Order Management Platform'
  },
  containerName: {
    means: 'The name of a major structural building block (an application, service, or data store) within the system.',
    example: 'Order API'
  },
  containerDescription: {
    means: 'What this container is responsible for.',
    example: 'Provides order management functionality.'
  },
  containerTechnology: {
    means: 'The technology this container is built with.',
    example: 'Spring Boot'
  },
  componentParent: {
    means: 'Which container this component lives inside.',
    example: 'Order API'
  },
  componentName: {
    means: 'The name of a grouping of related functionality inside a container.',
    example: 'Order Service'
  },
  componentDescription: {
    means: 'What this component is responsible for.',
    example: 'Coordinates order creation and validation.'
  },
  componentTechnology: {
    means: 'Optional: the technology or pattern this component uses.',
    example: 'Java'
  },
  scenarioName: {
    means: 'A short name for the business or technical scenario you want to describe as a sequence of interactions.',
    example: 'Customer places order'
  },
  scenarioStep: {
    means: 'One step in the sequence: who/what sends to whom/what, and why.',
    example: 'Customer → Web Application — "Places order"'
  },
  deploymentEnvironment: {
    means: 'The name of a deployment environment.',
    example: 'Production'
  },
  deploymentNode: {
    means: 'An infrastructure node (e.g. a server, cluster, or managed service) within the environment.',
    example: 'Azure Kubernetes Service'
  },
  deploymentInstance: {
    means: 'Which container or software system is deployed onto this node.',
    example: 'Order API'
  }
};
