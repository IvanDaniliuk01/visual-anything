/**
 * Mermaid diagrams for the reader's tests, written by hand as people write them: one of each kind the
 * reader reads, and hostile ones. Kept as text here, since the core's tests load no files.
 */

/** A flowchart with a title, shapes, classes, a subgraph, edge labels, chains and `&`, styles and a link. */
export const FLOWCHART = `---
title: Checkout
config:
  theme: forest
---
flowchart LR
  %% The shop's checkout, as the team drew it.
  shopper((Shopper)) -->|browses| web[Web shop]
  web --> cart(Cart service):::service
  cart -- reads --> stock[(Stock DB)]
  cart ==> pay{{Payment provider}}
  subgraph backend [Back end]
    cart
    stock
    worker[[Order worker]]
  end
  pay -.-> worker & web
  worker --- stock
  classDef service fill:#dfe,stroke:#363
  class worker service
  click pay "https://pay.example.com" "Open the provider"
  style web fill:#ffd
`;

/** A C4 container diagram with a boundary, technologies, named parameters, `Rel_Back` and styles. */
export const C4 = `C4Container
title Containers of the clinic's booking system
Person(patient, "Patient", "Books appointments over WhatsApp.")
System_Ext(whatsapp, "WhatsApp", "Meta's messaging service.")
System_Boundary(booking, "Booking system") {
  Container(agent, "Booking agent", "Python, Claude", "Answers patients and books slots.")
  ContainerDb(db, "Appointments DB", "PostgreSQL", "Holds slots and bookings.")
  Container(api, "Appointments API", "Node.js", $descr="Books and frees slots.", $link="https://example.com/api")
}
Rel(patient, whatsapp, "Sends messages", "WhatsApp")
Rel(whatsapp, agent, "Forwards messages", "HTTPS")
BiRel(agent, api, "Books slots", "HTTPS/JSON")
Rel_Back(db, api, "Reads and writes", "SQL")
UpdateRelStyle(patient, whatsapp, $textColor="blue")
UpdateLayoutConfig($c4ShapeInRow="3")
`;

/** An ER diagram with cardinalities in symbols and words, keys, comments and a quoted name. */
export const ER = `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses
    CUSTOMER {
        string name "The full name"
        string custNumber PK
        string sector
    }
    ORDER {
        int orderNumber PK
        string deliveryAddress FK
    }
    LINE-ITEM {
        string productCode PK, FK
        int quantity
        float pricePerUnit
    }
    "DELIVERY-ADDRESS" {
      string street UK
    }
    CUSTOMER only one to zero or more INVOICE : "is billed"
`;

/** A class diagram with members, annotations, generics, multiplicities, a namespace, notes and links. */
export const CLASSES = `classDiagram
    direction LR
    note "Animals of the farm"
    class Animal {
        <<abstract>>
        +String name
        +int age
        +makeSound() void
    }
    class Duck["Duck of the pond"] {
        +swim()
    }
    class Pond~T~
    Animal <|-- Duck
    Animal <|-- Fish : is a
    Duck "1" o-- "*" Egg : lays
    Pond *-- Duck
    Duck ..> Pond : swims in
    class Swimmer
    <<interface>> Swimmer
    Duck ..|> Swimmer
    namespace Water {
        class Fish
        class Pond
    }
    Animal : +isMammal() bool
    click Duck href "https://example.com/duck"
    link Fish "https://example.com/fish"
    callback Animal "showAnimal"
`;

/** A flowchart whose labels hold HTML, script tags, entities and Mermaid's own entity codes. */
export const HOSTILE = `flowchart TD
  A["<b>Bold</b> <script>alert('x')</script>name"] --> B["<img src=x onerror=alert(1)>Pic"]
  B --> C["#quot;quoted#quot; &amp; #35;hash"]
  C -->|"<a href='javascript:alert(1)'>link</a>"| D
  %%{init: {"securityLevel": "loose"}}%%
  click A call alert("x")
  E@{ shape: cyl, label: "Stock <i>DB</i>" }
  F@{ img: "https://example.com/logo.png", label: "Logo" }
`;
