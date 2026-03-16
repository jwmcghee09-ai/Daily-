# Year 11 Advanced Mathematics — Topic 1: Functions

This is the foundation of all of advanced mathematics.

---

## 1.1 What is a Function?

A **function** is a rule that assigns **exactly one output** to every input.

- Written as: `f(x) = ...`
- `x` is the **input** (independent variable)
- `f(x)` is the **output** (dependent variable)

### Example
```
f(x) = 2x + 3

f(1)  = 2(1) + 3  = 5
f(4)  = 2(4) + 3  = 11
f(-2) = 2(-2) + 3 = -1
```

---

## 1.2 Domain and Range

| Term       | Meaning                                      |
|------------|----------------------------------------------|
| **Domain** | All valid **input** values (x-values)        |
| **Range**  | All possible **output** values (y-values)    |

### When to Restrict the Domain
- Division by zero → exclude that x
- Square root of a negative → require expression ≥ 0
- Logarithm of zero or negative → require argument > 0

### Examples

**f(x) = 1/x**
- Domain: x ∈ ℝ, x ≠ 0  i.e.  (-∞, 0) ∪ (0, ∞)
- Range:  y ∈ ℝ, y ≠ 0

**f(x) = √(x − 3)**
- Need: x − 3 ≥ 0  →  x ≥ 3
- Domain: [3, ∞)
- Range:  [0, ∞)

**f(x) = x²**
- Domain: (-∞, ∞)  (all reals)
- Range:  [0, ∞)   (squares are never negative)

---

## 1.3 Function Notation and Evaluation

```
f(x) = x² − 4x + 1

f(3)   = 9 − 12 + 1  = −2
f(−1)  = 1 + 4  + 1  =  6
f(a)   = a² − 4a + 1
f(a+1) = (a+1)² − 4(a+1) + 1
       = a² + 2a + 1 − 4a − 4 + 1
       = a² − 2a − 2
```

---

## 1.4 Vertical Line Test

A graph represents a function **if and only if** every vertical line crosses it at most once.

```
✅  y = x²        (parabola)  → IS a function
✅  y = x³        (cubic)     → IS a function
❌  x² + y² = 4   (circle)    → NOT a function
```

---

## 1.5 Types of Functions

### Linear:  f(x) = mx + b
- Straight line, gradient m, y-intercept b
- Domain and Range: all reals

### Quadratic:  f(x) = ax² + bx + c
- Parabola shape
- Domain: all reals
- Range: [vertex y-value, ∞) if a > 0  |  (−∞, vertex y-value] if a < 0

### Hyperbola:  f(x) = a/x
- Two branches, asymptotes at x = 0 and y = 0
- Domain: x ≠ 0,  Range: y ≠ 0

### Square Root:  f(x) = √x
- Domain: x ≥ 0,  Range: y ≥ 0

### Absolute Value:  f(x) = |x|
- V-shaped graph
- Domain: all reals,  Range: y ≥ 0

---

## 1.6 Odd and Even Functions

| Type     | Definition          | Graph Symmetry                   |
|----------|---------------------|----------------------------------|
| **Even** | f(−x) = f(x)        | Symmetric about the **y-axis**   |
| **Odd**  | f(−x) = −f(x)       | Symmetric about the **origin**   |

### Testing Examples

```
f(x) = x⁴ − 2x²
f(−x) = (−x)⁴ − 2(−x)² = x⁴ − 2x² = f(x)   → EVEN ✅

g(x) = x³ − x
g(−x) = −x³ + x = −(x³ − x) = −g(x)          → ODD ✅

h(x) = x² + x
h(−x) = x² − x   ≠ h(x) and ≠ −h(x)           → NEITHER
```

---

## 1.7 Transformations of Functions

Starting from y = f(x):

| Transformation        | Equation          | Effect                      |
|-----------------------|-------------------|-----------------------------|
| Shift up k units      | y = f(x) + k      | Graph moves up              |
| Shift down k units    | y = f(x) − k      | Graph moves down            |
| Shift right h units   | y = f(x − h)      | Graph moves right           |
| Shift left h units    | y = f(x + h)      | Graph moves left            |
| Vertical stretch a>1  | y = a·f(x)        | Graph taller                |
| Vertical compress 0<a<1| y = a·f(x)       | Graph shorter               |
| Reflect in x-axis     | y = −f(x)         | Graph flips upside down     |
| Reflect in y-axis     | y = f(−x)         | Graph flips left-right      |

### Example — Quadratic Transformations
```
y = x²                 → base parabola, vertex (0,0)
y = (x − 3)²          → shift RIGHT 3,  vertex (3, 0)
y = x² + 5            → shift UP 5,     vertex (0, 5)
y = −x²               → reflect in x-axis
y = 2x²               → vertical stretch by factor 2
y = (x + 1)² − 4      → shift LEFT 1, DOWN 4,  vertex (−1, −4)
```

---

## 1.8 Composite Functions

(f ∘ g)(x) = f(g(x))  — apply g first, then apply f to the result.

```
f(x) = 2x + 1,   g(x) = x²

f(g(x)) = f(x²)     = 2(x²) + 1  = 2x² + 1
g(f(x)) = g(2x+1)   = (2x+1)²    = 4x² + 4x + 1
```

**Note:** f(g(x)) ≠ g(f(x)) in general.

### Domain of a Composite
For f(g(x)):
1. x must be in the domain of g
2. g(x) must be in the domain of f

```
f(x) = √x,   g(x) = x − 4

f(g(x)) = √(x − 4)
Domain: x − 4 ≥ 0  →  x ≥ 4  →  [4, ∞)
```

---

## 1.9 Inverse Functions

The inverse f⁻¹(x) **undoes** f, so f(f⁻¹(x)) = x.

**Requirement:** f must be one-to-one (passes the horizontal line test).

### Steps to Find the Inverse
1. Write  y = f(x)
2. Swap x and y
3. Solve for y
4. Write  f⁻¹(x) = ...

```
f(x) = 3x − 6

y  = 3x − 6
x  = 3y − 6       ← swap x and y
x + 6 = 3y
y = (x + 6) / 3

∴  f⁻¹(x) = (x + 6) / 3
```

### Key Properties
- Domain of f⁻¹  =  Range of f
- Range  of f⁻¹  =  Domain of f
- Graph of f⁻¹ is the **reflection of f in the line y = x**
- f(f⁻¹(x)) = x  and  f⁻¹(f(x)) = x

---

## 1.10 Piecewise Functions

Different rules apply over different parts of the domain.

```
       ┌  x + 1    if x < 0
f(x) = ┤  x²       if 0 ≤ x ≤ 3
       └  2x − 3   if x > 3

f(−2) = (−2) + 1 = −1     (x < 0,  use rule 1)
f(2)  = (2)²     =  4     (0 ≤ x ≤ 3,  use rule 2)
f(5)  = 2(5) − 3 =  7     (x > 3,  use rule 3)
```

---

## Practice Questions

### Basic
1. Find the domain of  f(x) = √(2x − 8)
2. Evaluate f(3) where f(x) = x² − 5x + 2
3. Is f(x) = x⁶ − 3x²  even, odd, or neither?

### Intermediate
4. Given f(x) = x + 2 and g(x) = x², find f(g(x)) and g(f(x))
5. Find f⁻¹(x) for  f(x) = (2x + 1) / 3
6. Describe all transformations from  y = x²  to  y = −(x + 2)² + 5

### Challenge
7. Find the domain of  h(x) = √x / (x² − 9)
8. Prove that  f(x) = x/(x² + 1)  is an odd function
9. Given f(x) = 2x − 1 and f(g(x)) = 4x + 3, find g(x)

---

## Answers to Practice Questions

### Basic
1. 2x − 8 ≥ 0  →  x ≥ 4.  Domain: [4, ∞)
2. f(3) = 9 − 15 + 2 = −4
3. f(−x) = (−x)⁶ − 3(−x)² = x⁶ − 3x² = f(x)  → **Even**

### Intermediate
4. f(g(x)) = x² + 2;   g(f(x)) = (x+2)² = x² + 4x + 4
5. y = (2x+1)/3  →  swap: x = (2y+1)/3  →  3x = 2y+1  →  y = (3x−1)/2
   f⁻¹(x) = (3x − 1) / 2
6. Shift LEFT 2, REFLECT in x-axis, shift UP 5;  vertex moves to (−2, 5)

### Challenge
7. Need x ≥ 0 (√x) AND x² − 9 ≠ 0 (x ≠ ±3)
   Since x ≥ 0, only exclude x = 3.  Domain: [0, 3) ∪ (3, ∞)
8. f(−x) = (−x)/((−x)²+1) = −x/(x²+1) = −f(x)  ✅  → Odd
9. f(g(x)) = 2g(x) − 1 = 4x + 3  →  2g(x) = 4x + 4  →  g(x) = 2x + 2

---

## Key Formulas Summary

```
Even function:         f(−x) = f(x)
Odd function:          f(−x) = −f(x)
Composite function:    (f∘g)(x) = f(g(x))
Inverse definition:    f(f⁻¹(x)) = x
Inverse domain:        dom(f⁻¹) = range(f)
Inverse range:         range(f⁻¹) = dom(f)
```
