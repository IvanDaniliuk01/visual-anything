---
status: accepted
---

# 2D canvas; physical space lives inside components

The canvas is two-dimensional (with abstraction levels), and physical space is shown only inside the components that need it, such as a brain or a robotic arm. We chose this because text and relations read worse in a 3D space, and 3D only helps when the physical arrangement is the data itself.

## Considered options

- **Fully 3D canvas**: rejected. Makes every view harder to read to benefit a few.
- **2D/3D toggle per view**: rejected. Doubles the rendering engine and interaction without a case that justifies it.
