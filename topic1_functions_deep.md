# Year 11 Advanced Mathematics — Topic 1: Functions (In-Depth)

---

# PART A: RELATIONS AND FUNCTIONS

---

## A.1 Relations

A **relation** is any set of ordered pairs (x, y). The set of all first elements is the **domain**
and the set of all second elements is the **range**.

Relations can be expressed as:
- A set of ordered pairs:  { (1,2), (3,4), (5,6) }
- An equation:  y = x² − 1
- A graph
- A mapping diagram

### Example — Is it a relation?
Any equation connecting x and y defines a relation.
- y = x + 3          ✅ relation
- x² + y² = 25       ✅ relation  (circle)
- x = 4              ✅ relation  (vertical line — all points with x = 4)

---

## A.2 Functions — The Formal Definition

A **function** is a relation in which every x-value maps to **exactly one** y-value.

More formally:  f is a function if  (a, b) ∈ f  and  (a, c) ∈ f  implies  b = c.

### Mapping Diagram Language
```
NOT a function:          IS a function:
  1 ──→ 3                 1 ──→ 5
  1 ──→ 7    ← x=1        2 ──→ 8
  2 ──→ 4      has two     3 ──→ 11
               outputs     4 ──→ 14
```

Two different x-values CAN map to the same y-value — that is fine.
```
  2 ──→ 4          ← f(2) = 4  and  f(−2) = 4
 −2 ──→ 4            both fine — different inputs, same output
```

### The Vertical Line Test (VLT)
A graph represents a function ↔ every vertical line x = a cuts the graph at most once.

```
y = x²      Parabola — every vertical line hits once   → FUNCTION ✅
x = y²      Sideways parabola — vertical lines hit twice → NOT a function ❌
x² + y² = r² Circle — vertical lines hit twice           → NOT a function ❌
```

Why it works: if x = a crosses the graph at two points (a, b) and (a, c) with b ≠ c,
then input a has two outputs b and c — violating the function definition.

---

## A.3 Domain and Range — Deep Treatment

### Natural (Implied) Domain
The natural domain is all real x for which the expression is **defined**.

Three main restrictions:

**1. Denominator cannot equal zero**
```
f(x) = 5 / (x − 3)
Restriction: x − 3 ≠ 0  →  x ≠ 3
Domain: (-∞, 3) ∪ (3, ∞)  or  x ∈ ℝ, x ≠ 3
```

**2. Expression under even root must be ≥ 0**
```
f(x) = √(4 − x²)
Restriction: 4 − x² ≥ 0
             x² ≤ 4
             −2 ≤ x ≤ 2
Domain: [−2, 2]
```

**3. Argument of logarithm must be > 0**
```
f(x) = log(2x − 1)
Restriction: 2x − 1 > 0  →  x > 1/2
Domain: (1/2, ∞)
```

### Combining Restrictions — Step by Step
```
f(x) = √(x + 5) / (x − 2)

Restriction 1 (√):      x + 5 ≥ 0   →   x ≥ −5
Restriction 2 (denom):  x − 2 ≠ 0   →   x ≠ 2

Both must hold:  x ≥ −5  AND  x ≠ 2

Domain:  [−5, 2) ∪ (2, ∞)
```

### Interval Notation Reference Table

| Notation      | Meaning                    | Graph         |
|---------------|----------------------------|---------------|
| (a, b)        | a < x < b                  | open–open     |
| [a, b]        | a ≤ x ≤ b                  | closed–closed |
| [a, b)        | a ≤ x < b                  | closed–open   |
| (a, ∞)        | x > a                      | open–right    |
| (−∞, b]       | x ≤ b                      | left–closed   |
| (−∞, ∞)       | all reals                  | full line     |

### Finding the Range

The range is trickier — you need to think about what y-values the function can actually output.

**Method 1: Graph the function and read off the y-values**

**Method 2: Solve for x in terms of y and find restrictions on y**
```
f(x) = (x + 1) / (x − 2)

Let y = (x + 1)/(x − 2)
y(x − 2) = x + 1
yx − 2y = x + 1
yx − x = 2y + 1
x(y − 1) = 2y + 1
x = (2y + 1)/(y − 1)

For x to exist: y − 1 ≠ 0  →  y ≠ 1
Range: y ∈ ℝ, y ≠ 1
```

**Method 3: Complete the square for quadratics**
```
f(x) = x² − 6x + 11

Complete the square:
= (x − 3)² − 9 + 11
= (x − 3)² + 2

Since (x−3)² ≥ 0,  the minimum value is 2 (when x = 3)
Range: [2, ∞)
```

---

## A.4 Function Notation — Full Treatment

### Basic Evaluation
```
f(x) = 3x² − 2x + 1

f(0)   = 0 − 0 + 1 = 1
f(2)   = 12 − 4 + 1 = 9
f(−3)  = 3(9) − 2(−3) + 1 = 27 + 6 + 1 = 34
f(1/2) = 3(1/4) − 2(1/2) + 1 = 3/4 − 1 + 1 = 3/4
```

### Evaluating Algebraic Expressions
```
f(x) = x² − 4

f(a)     = a² − 4
f(a + h) = (a + h)² − 4
         = a² + 2ah + h² − 4

f(a + h) − f(a) = a² + 2ah + h² − 4 − (a² − 4)
                = 2ah + h²
                = h(2a + h)
```

### The Difference Quotient (critical for calculus later)
The **difference quotient** is:

```
[f(x + h) − f(x)] / h    (h ≠ 0)
```

This measures the average rate of change — the foundation of differentiation.

**Example:** Find the difference quotient for f(x) = x² + 3x
```
f(x + h) = (x + h)² + 3(x + h)
          = x² + 2xh + h² + 3x + 3h

f(x + h) − f(x) = x² + 2xh + h² + 3x + 3h − x² − 3x
                = 2xh + h² + 3h
                = h(2x + h + 3)

[f(x+h) − f(x)] / h = h(2x + h + 3) / h = 2x + h + 3

As h → 0, this approaches  2x + 3  (this is the derivative!)
```

---

# PART B: KEY FUNCTION TYPES — DETAILED

---

## B.1 Linear Functions:  y = mx + b

### Key Features
| Feature       | Formula/Method                        |
|---------------|---------------------------------------|
| Gradient      | m = rise/run = (y₂−y₁)/(x₂−x₁)      |
| y-intercept   | b (set x = 0)                         |
| x-intercept   | Set y = 0, solve for x                |
| Domain        | All reals                             |
| Range         | All reals                             |

### Forms of a Linear Equation
```
Slope-intercept:    y = mx + b         (most common)
Point-slope:        y − y₁ = m(x − x₁)  (use when given a point and gradient)
General form:       ax + by + c = 0
Two-point:          (y−y₁)/(y₂−y₁) = (x−x₁)/(x₂−x₁)
```

### Gradient Conditions
| Condition              | Meaning           |
|------------------------|-------------------|
| m > 0                  | Increasing line   |
| m < 0                  | Decreasing line   |
| m = 0                  | Horizontal line   |
| Line is vertical       | Gradient undefined|
| m₁ = m₂               | Parallel lines    |
| m₁ × m₂ = −1          | Perpendicular     |

### Worked Example
Find the equation of the line through (2, 5) and (−1, −4).

```
m = (5 − (−4)) / (2 − (−1)) = 9/3 = 3

Using y − y₁ = m(x − x₁) with (2, 5):
y − 5 = 3(x − 2)
y − 5 = 3x − 6
y = 3x − 1
```

---

## B.2 Quadratic Functions:  y = ax² + bx + c

### Three Forms

**Standard form:**    y = ax² + bx + c
- a > 0: concave up (∪) ;   a < 0: concave down (∩)
- y-intercept = c

**Vertex form:**      y = a(x − h)² + k
- Vertex at (h, k)
- Axis of symmetry: x = h

**Factored form:**    y = a(x − p)(x − q)
- x-intercepts (roots) at x = p and x = q
- Axis of symmetry: x = (p + q)/2

### Converting to Vertex Form — Completing the Square

**Method:**
```
y = 2x² − 8x + 5

Step 1: Factor out 'a' from x-terms
y = 2(x² − 4x) + 5

Step 2: Complete the square inside brackets
Half of −4 is −2.   (−2)² = 4
Add and subtract 4 inside:
y = 2(x² − 4x + 4 − 4) + 5
y = 2((x − 2)² − 4) + 5

Step 3: Expand the outer factor
y = 2(x − 2)² − 8 + 5
y = 2(x − 2)² − 3

Vertex: (2, −3)    Axis of symmetry: x = 2
Since a = 2 > 0:   Range = [−3, ∞)
```

### Quadratic Formula and Discriminant

For ax² + bx + c = 0:
```
x = (−b ± √(b² − 4ac)) / 2a

Discriminant  Δ = b² − 4ac:
  Δ > 0   →   two distinct real roots   (graph crosses x-axis twice)
  Δ = 0   →   one repeated root         (graph touches x-axis once)
  Δ < 0   →   no real roots             (graph doesn't touch x-axis)
```

### Key Features of a Quadratic — Complete Summary
```
y = ax² + bx + c

Vertex x-coordinate:   x = −b/(2a)
Vertex y-coordinate:   substitute back into equation
Axis of symmetry:      x = −b/(2a)
y-intercept:           (0, c)
x-intercepts:          solve ax² + bx + c = 0  (if they exist)
Domain:                all reals
Range:                 [vertex y, ∞) if a > 0  |  (−∞, vertex y] if a < 0
```

### Worked Example — Full Analysis
Analyse y = −x² + 4x + 5 completely.

```
a = −1,  b = 4,  c = 5

Vertex x: x = −4/(2×−1) = −4/−2 = 2
Vertex y: y = −(4) + 4(2) + 5 = −4 + 8 + 5 = 9
Vertex: (2, 9)

Axis of symmetry: x = 2

y-intercept: (0, 5)

x-intercepts:  −x² + 4x + 5 = 0
               x² − 4x − 5 = 0
               (x − 5)(x + 1) = 0
               x = 5  or  x = −1
x-intercepts: (5, 0) and (−1, 0)

Domain: all reals  (−∞, ∞)
Range: (−∞, 9]    (concave down, max at vertex)

Shape: concave down  ∩
```

---

## B.3 Hyperbola:  y = k/x  and  y = k/(x − h) + v

### Basic Hyperbola  y = 1/x
```
Asymptotes: x = 0 (vertical),  y = 0 (horizontal)
Domain: x ≠ 0
Range:  y ≠ 0
If k > 0: curves in 1st and 3rd quadrants
If k < 0: curves in 2nd and 4th quadrants
```

### Shifted Hyperbola  y = a/(x − h) + k
```
Vertical asymptote:   x = h
Horizontal asymptote: y = k
Domain: x ≠ h
Range:  y ≠ k
```

### Worked Example
Sketch y = 2/(x − 3) + 1 and state domain and range.
```
Vertical asymptote:   x = 3
Horizontal asymptote: y = 1

x-intercept: set y = 0
  0 = 2/(x−3) + 1
  −1 = 2/(x−3)
  −(x−3) = 2
  x − 3 = −2
  x = 1   →   (1, 0)

y-intercept: set x = 0
  y = 2/(0−3) + 1 = −2/3 + 1 = 1/3   →   (0, 1/3)

Domain: x ∈ ℝ, x ≠ 3   →   (−∞, 3) ∪ (3, ∞)
Range:  y ∈ ℝ, y ≠ 1   →   (−∞, 1) ∪ (1, ∞)
```

---

## B.4 Square Root Function:  y = √(x − h) + k

```
Basic: y = √x
Domain: x ≥ 0,   Range: y ≥ 0
Starting point: (0, 0)
Shape: starts at origin, curves right and up

y = √(x − 3) + 2
Starting point: (3, 2)   [domain starts here]
Domain: x ≥ 3,   Range: y ≥ 2
```

### Worked Example
Find domain and range of  y = −√(5 − x) + 4

```
Domain:  5 − x ≥ 0  →  x ≤ 5   →   (−∞, 5]

The basic √ starts at 0 and goes up.
−√(5−x):  the negative sign reflects in x-axis, so it goes DOWN from 0.
           values are ≤ 0
−√(5−x) + 4:  shift UP 4, so values are ≤ 4

Range:  y ≤ 4   →   (−∞, 4]

Starting point: x = 5,  y = −√0 + 4 = 4   →   (5, 4)
```

---

## B.5 Absolute Value Function:  y = |x|

### Definition
```
|x| = x    if x ≥ 0
|x| = −x   if x < 0
```

This means |x| is always non-negative. It gives the **distance** from zero on the number line.

### Absolute Value Equations
|f(x)| = c  (c > 0)  has two cases:
```
f(x) = c    OR    f(x) = −c
```

**Example:** Solve |2x − 3| = 7
```
Case 1: 2x − 3 = 7   →   2x = 10   →   x = 5
Case 2: 2x − 3 = −7  →   2x = −4   →   x = −2

Solutions: x = 5  or  x = −2
```

### Absolute Value Inequalities
```
|f(x)| < c    means   −c < f(x) < c          (between)
|f(x)| > c    means   f(x) < −c  OR  f(x) > c  (outside)
```

**Example:** Solve |3x + 1| < 8
```
−8 < 3x + 1 < 8
−9 < 3x < 7
−3 < x < 7/3

Solution: x ∈ (−3, 7/3)
```

**Example:** Solve |x − 4| ≥ 2
```
x − 4 ≤ −2    OR    x − 4 ≥ 2
x ≤ 2          OR    x ≥ 6

Solution: x ∈ (−∞, 2] ∪ [6, ∞)
```

### Graphing Absolute Value Functions
To graph y = |f(x)|:
- Sketch y = f(x)
- Any part below the x-axis: reflect it UP (flip sign)
- Any part above the x-axis: leave as is

---

# PART C: ODD, EVEN, AND SYMMETRY

---

## C.1 Even Functions

### Definition
f is **even** if  f(−x) = f(x)  for all x in the domain.

### Graph Property
Symmetric about the **y-axis**. If (a, b) is on the graph, so is (−a, b).

### Examples
```
f(x) = x²       f(−x) = (−x)² = x²  = f(x)    ✅  EVEN
f(x) = x⁴ − 3   f(−x) = x⁴ − 3     = f(x)    ✅  EVEN
f(x) = cos(x)   f(−x) = cos(−x) = cos(x)       ✅  EVEN
f(x) = |x|      f(−x) = |−x| = |x|  = f(x)    ✅  EVEN
```

### Key Rule
Any polynomial with **only even powers** (x², x⁴, x⁶, ...) and constants is EVEN.

---

## C.2 Odd Functions

### Definition
f is **odd** if  f(−x) = −f(x)  for all x in the domain.

### Graph Property
Has 180° rotational symmetry about the **origin**.
If (a, b) is on the graph, so is (−a, −b).

### Examples
```
f(x) = x³         f(−x) = −x³      = −f(x)   ✅  ODD
f(x) = x³ − 5x    f(−x) = −x³ + 5x = −f(x)   ✅  ODD
f(x) = 1/x        f(−x) = 1/(−x)   = −f(x)   ✅  ODD
f(x) = sin(x)     f(−x) = −sin(x)  = −f(x)   ✅  ODD
```

### Key Rule
Any polynomial with **only odd powers** (x, x³, x⁵, ...) is ODD.

### Note on f(x) = 0
The zero function is BOTH even and odd — it's the only such function.

---

## C.3 Proving Odd/Even — Formal Approach

Always show full algebraic working.

**Question:** Is f(x) = (x³ − x) / (x² + 1) odd, even, or neither?
```
f(−x) = ((−x)³ − (−x)) / ((−x)² + 1)
      = (−x³ + x) / (x² + 1)
      = −(x³ − x) / (x² + 1)
      = −f(x)

Since f(−x) = −f(x) for all x:   f is ODD
```

**Question:** Is f(x) = x³ + x² odd, even, or neither?
```
f(−x) = (−x)³ + (−x)²
      = −x³ + x²

Is this = f(x) = x³ + x²?     −x³ + x² ≠ x³ + x²   ❌
Is this = −f(x) = −x³ − x²?   −x³ + x² ≠ −x³ − x²  ❌

NEITHER
```

---

# PART D: TRANSFORMATIONS — COMPLETE TREATMENT

---

## D.1 The Six Transformations

Starting from  y = f(x):

### 1. Vertical Translation
```
y = f(x) + k       shifts UP by k      (k > 0)
y = f(x) − k       shifts DOWN by k    (k > 0)
```

### 2. Horizontal Translation
```
y = f(x − h)       shifts RIGHT by h   (h > 0)   ← note: MINUS in equation = right
y = f(x + h)       shifts LEFT by h    (h > 0)   ← PLUS in equation = left
```
**Memory trick:** Replace x with (x − h). To make the function zero, you need x = h.
So the "starting point" or centre moves to x = h.

### 3. Vertical Dilation (Stretch/Compress)
```
y = af(x)
  a > 1    →  stretch vertically by factor a  (graph gets taller)
  0 < a < 1 → compress vertically by factor a (graph gets shorter)
```
Every y-value is multiplied by a. x-intercepts stay fixed.

### 4. Horizontal Dilation (Stretch/Compress)
```
y = f(bx)
  0 < b < 1  →  stretch horizontally by factor 1/b  (graph widens)
  b > 1      →  compress horizontally by factor 1/b (graph narrows)
```
Every x-value is divided by b. y-intercept stays fixed.

### 5. Reflection in the x-axis
```
y = −f(x)       reflects in x-axis (flips upside down)
```
Every y-value changes sign. x-intercepts stay fixed.

### 6. Reflection in the y-axis
```
y = f(−x)       reflects in y-axis (flips left-right)
```
Every x-value changes sign. y-intercept stays fixed.

---

## D.2 Combining Transformations — Order Matters

When  y = a·f(b(x − h)) + k, apply in this order:

```
Step 1: Horizontal dilation by factor 1/b  (x → x/b)
Step 2: Horizontal translation by h        (x → x − h)  (right if h > 0)
Step 3: Vertical dilation by factor a      (y → ay)
Step 4: Vertical translation by k          (y → y + k)
```

Equivalently: brackets first (inside f), then outside f.

### Full Worked Example
Describe transformations from y = x² to y = −2(x + 3)² + 4

```
y = x²
→ y = (x + 3)²         Shift LEFT 3
→ y = 2(x + 3)²        Vertical stretch by factor 2
→ y = −2(x + 3)²       Reflect in x-axis
→ y = −2(x + 3)² + 4   Shift UP 4

Net result: vertex moves from (0,0) to (−3, 4)
            opens downward
```

### Another Example — Hyperbola
Describe transformations from y = 1/x to y = 3/(x − 2) − 5

```
y = 1/x
→ y = 1/(x − 2)        Shift RIGHT 2    (vertical asymptote: x = 2)
→ y = 3/(x − 2)        Vertical stretch by factor 3
→ y = 3/(x − 2) − 5    Shift DOWN 5     (horizontal asymptote: y = −5)
```

---

## D.3 Transformations of Specific Functions

### Square Root
```
y = √x               vertex: (0, 0),  opens right
y = √(x − a) + b     vertex: (a, b),  opens right
y = −√x              reflects down (opens right, but going down)
y = √(−x)            reflects in y-axis (opens LEFT)
```

### Absolute Value
```
y = |x|              vertex: (0, 0), V-shape opening up
y = |x − a| + b      vertex: (a, b), V-shape opening up
y = −|x|             vertex: (0, 0), V-shape opening DOWN
y = a|x − h| + k     vertex: (h, k), a > 0 up, a < 0 down, steepness = |a|
```

---

# PART E: COMPOSITE FUNCTIONS — IN DEPTH

---

## E.1 Definition and Evaluation

(f ∘ g)(x) = f(g(x)):  first apply g, then apply f to the result.

```
f(x) = x² + 1,   g(x) = 2x − 3

(f ∘ g)(x) = f(g(x)) = f(2x−3) = (2x−3)² + 1
                      = 4x² − 12x + 9 + 1
                      = 4x² − 12x + 10

(g ∘ f)(x) = g(f(x)) = g(x²+1) = 2(x²+1) − 3
                      = 2x² + 2 − 3
                      = 2x² − 1
```

Evaluating at a point:
```
f(x) = √x,   g(x) = x + 4

(f ∘ g)(5) = f(g(5)) = f(9) = √9 = 3

(g ∘ f)(9) = g(f(9)) = g(3) = 3 + 4 = 7
```

---

## E.2 Domain of Composite Functions — Formal Method

For (f ∘ g)(x) = f(g(x)), the domain is:

> All x in the domain of g such that g(x) is in the domain of f.

### Full Method:
```
1. Find domain of g (call it Dg)
2. Find domain of f (call it Df)
3. Find all x in Dg such that g(x) ∈ Df
4. The domain of f∘g is the result of step 3
```

### Worked Example 1
f(x) = 1/(x − 2),   g(x) = √x

Find domain of f(g(x)).

```
g(x) = √x:         domain of g: x ≥ 0

f(g(x)) = f(√x) = 1/(√x − 2)

For f to be defined: √x − 2 ≠ 0  →  √x ≠ 2  →  x ≠ 4

Combining:  x ≥ 0  AND  x ≠ 4

Domain of f∘g:  [0, 4) ∪ (4, ∞)
```

### Worked Example 2
f(x) = √x,   g(x) = x² − 4

Find domain of f(g(x)).

```
g(x) = x² − 4:       domain of g: all reals ℝ

f(g(x)) = f(x²−4) = √(x² − 4)

For f to be defined: x² − 4 ≥ 0
                     x² ≥ 4
                     |x| ≥ 2
                     x ≤ −2  OR  x ≥ 2

Domain of f∘g:  (−∞, −2] ∪ [2, ∞)
```

---

## E.3 Decomposing a Composite Function

Given h(x), find f and g such that h(x) = f(g(x)).

**Strategy:** Identify the "inner" operation (g) and the "outer" operation (f).

```
h(x) = (x² + 3)⁵

g(x) = x² + 3     (inner)
f(x) = x⁵         (outer)
Check: f(g(x)) = (x² + 3)⁵  ✅


h(x) = √(2x − 1)

g(x) = 2x − 1     (inner)
f(x) = √x          (outer)
Check: f(g(x)) = √(2x−1)  ✅


h(x) = 1/(x + 5)²

g(x) = x + 5       (inner)
f(x) = 1/x²        (outer)
Check: f(g(x)) = 1/(x+5)²  ✅
```

---

# PART F: INVERSE FUNCTIONS — IN DEPTH

---

## F.1 Definition and Intuition

If f maps a → b, then f⁻¹ maps b → a.

f⁻¹ **reverses** the action of f.

```
f(x) = 3x:  f maps 2 → 6, and 5 → 15
f⁻¹(x) = x/3:  f⁻¹ maps 6 → 2, and 15 → 5
```

**Important:** f⁻¹(x) is NOT the same as [f(x)]⁻¹ = 1/f(x).
f⁻¹ means "inverse function", not "reciprocal".

---

## F.2 One-to-One (Injective) Functions

A function has an inverse **only if** it is one-to-one: each y-value comes from exactly one x-value.

**Horizontal Line Test (HLT):** A function has an inverse ↔ every horizontal line cuts the graph at most once.

```
y = x³     → HLT passes everywhere   → has an inverse ✅
y = x²     → HLT fails (e.g. y=4 hits at x=2 AND x=−2) → no inverse ❌
              (unless domain is restricted)
```

---

## F.3 Finding the Inverse — Method

```
Step 1: Write y = f(x)
Step 2: Swap x and y  (this reflects the relationship)
Step 3: Solve for y
Step 4: Write f⁻¹(x) = [result]
Step 5: State the domain and range of f⁻¹
```

### Examples

**Example 1: Linear**
```
f(x) = 4x − 7

y = 4x − 7
x = 4y − 7    (swap)
x + 7 = 4y
y = (x + 7)/4

f⁻¹(x) = (x + 7)/4
Domain of f⁻¹: all reals  (same as range of f)
```

**Example 2: With a square root**
```
f(x) = √(x + 2)   domain: x ≥ −2,  range: y ≥ 0

y = √(x + 2)
x = √(y + 2)    (swap)
x² = y + 2      (square both sides)
y = x² − 2

f⁻¹(x) = x² − 2

Domain of f⁻¹: x ≥ 0  (= range of f)
Range  of f⁻¹: y ≥ −2 (= domain of f)
```

**Example 3: Fraction**
```
f(x) = (3x + 1)/(x − 2)

y = (3x + 1)/(x − 2)
x = (3y + 1)/(y − 2)    (swap)
x(y − 2) = 3y + 1
xy − 2x = 3y + 1
xy − 3y = 2x + 1
y(x − 3) = 2x + 1
y = (2x + 1)/(x − 3)

f⁻¹(x) = (2x + 1)/(x − 3)
```

---

## F.4 Restricting the Domain to Create an Inverse

When a function is NOT one-to-one, we **restrict the domain** to make it one-to-one.

### Example: y = x²
The full parabola fails the HLT.

**Restriction 1:** x ≥ 0  (right half of parabola)
```
f(x) = x²,  x ≥ 0,  range: y ≥ 0

Swap: x = y²  →  y = √x  (take positive root since y ≥ 0)
f⁻¹(x) = √x,   domain: x ≥ 0
```

**Restriction 2:** x ≤ 0  (left half of parabola)
```
f(x) = x²,  x ≤ 0,  range: y ≥ 0

Swap: x = y²  →  y = −√x  (take negative root since y ≤ 0)
f⁻¹(x) = −√x,   domain: x ≥ 0
```

---

## F.5 Graph of the Inverse

The graph of y = f⁻¹(x) is the **reflection of y = f(x) in the line y = x**.

Why: swapping x and y reflects every point (a, b) to (b, a), which is reflection in y = x.

### Key points to reflect:
```
f contains point (a, b)  →  f⁻¹ contains point (b, a)
```

### Verifying Inverses
f and f⁻¹ are inverses ↔ f(f⁻¹(x)) = x  AND  f⁻¹(f(x)) = x

**Example:** Verify f(x) = 2x + 1 and f⁻¹(x) = (x−1)/2 are inverses.
```
f(f⁻¹(x)) = f((x−1)/2) = 2·(x−1)/2 + 1 = (x−1) + 1 = x  ✅
f⁻¹(f(x)) = f⁻¹(2x+1) = (2x+1−1)/2 = 2x/2 = x           ✅
```

---

# PART G: PIECEWISE FUNCTIONS — IN DEPTH

---

## G.1 Definition and Evaluation

A piecewise function uses different formulas over different intervals.

```
       ┌  2x + 1        if x < −1
f(x) = ┤  x²            if −1 ≤ x ≤ 2
       └  3x − 4        if x > 2

Evaluate:
f(−3) = 2(−3) + 1 = −5              (x = −3 < −1, use rule 1)
f(−1) = (−1)² = 1                   (x = −1,  −1 ≤ x ≤ 2, rule 2)
f(0)  = 0² = 0                      (x = 0,   −1 ≤ x ≤ 2, rule 2)
f(2)  = (2)² = 4                    (x = 2,   −1 ≤ x ≤ 2, rule 2)
f(5)  = 3(5) − 4 = 11               (x = 5 > 2, use rule 3)
```

---

## G.2 Continuity at Breakpoints

A piecewise function is **continuous** at a breakpoint x = a if the left-hand and right-hand values agree.

```
       ┌  x² + 1      if x ≤ 2
f(x) = ┤
       └  3x − 1      if x > 2

At x = 2:
Left:   f(2) = 2² + 1 = 5     (using first rule, x ≤ 2)
Right:  lim as x→2⁺ = 3(2) − 1 = 5

Left = Right = 5  →  CONTINUOUS at x = 2  ✅
```

```
       ┌  x + 3       if x < 1
g(x) = ┤
       └  2x           if x ≥ 1

At x = 1:
Left:  lim as x→1⁻ = 1 + 3 = 4
Right: g(1) = 2(1) = 2

Left ≠ Right  →  DISCONTINUOUS (jump) at x = 1  ❌
```

---

## G.3 Graphing Piecewise Functions

Key points:
- **Open circle** ○ at an endpoint where that piece does NOT include that x-value (strict inequality)
- **Closed circle** ● at an endpoint where that piece DOES include that x-value (≤ or ≥)

```
       ┌  x + 2       if x < 0     (open at x=0 from this piece)
f(x) = ┤
       └  x² + 1      if x ≥ 0     (closed at x=0 from this piece)

At x = 0:
Left piece gives: 0 + 2 = 2  (open circle at (0, 2))
Right piece gives: 0 + 1 = 1  (closed circle at (0, 1))

There is a jump discontinuity at x = 0.
```

---

## G.4 Domain and Range of Piecewise Functions

```
       ┌  √x          if 0 ≤ x < 4
f(x) = ┤
       └  8 − x        if x ≥ 4

Domain: [0, 4) ∪ [4, ∞) = [0, ∞)

Range of first piece √x on [0,4):   [0, 2)    (√0=0, approaching √4=2 but not reaching)
Range of second piece 8−x on [4,∞): (−∞, 4]   (at x=4, y=4; as x→∞, y→−∞)

Combined range: (−∞, 4]  (note: [0,2) is contained within (−∞,4])
Actually let's be precise: (−∞, 2) ∪ [0, 2) ∪ {values from 8−x}
= (−∞, 4]
```

---

# PART H: DEEPER PROBLEM TYPES

---

## H.1 Finding a Function Given Conditions

**Example:** Find f(x) if f(x+2) = 3x − 1

```
Let u = x + 2,  so x = u − 2

f(u) = 3(u − 2) − 1
     = 3u − 6 − 1
     = 3u − 7

∴ f(x) = 3x − 7
```

**Verification:** f(x+2) = 3(x+2) − 7 = 3x + 6 − 7 = 3x − 1  ✅

---

## H.2 Working Backwards from Composite

**Example:** f(g(x)) = √(2x + 5) and f(x) = √(x + 1). Find g(x).
```
f(g(x)) = √(g(x) + 1) = √(2x + 5)

So:  g(x) + 1 = 2x + 5
     g(x) = 2x + 4
```

**Example:** g(f(x)) = x² − 6x + 10 and g(x) = x² + 1. Find f(x).
```
g(f(x)) = (f(x))² + 1 = x² − 6x + 10

(f(x))² = x² − 6x + 9
(f(x))² = (x − 3)²
f(x) = x − 3   or   f(x) = −(x − 3)
```

---

## H.3 Proving Statements about Functions

**Example:** Prove that the sum of two odd functions is odd.
```
Let f and g be odd. Then f(−x) = −f(x) and g(−x) = −g(x).
Let h(x) = f(x) + g(x).

h(−x) = f(−x) + g(−x)
       = −f(x) + (−g(x))
       = −(f(x) + g(x))
       = −h(x)

∴ h is odd.  QED
```

**Example:** Prove that the product of two odd functions is even.
```
Let f and g be odd. Let h(x) = f(x)·g(x).

h(−x) = f(−x)·g(−x)
       = (−f(x))·(−g(x))
       = f(x)·g(x)
       = h(x)

∴ h is even.  QED
```

---

## H.4 Self-Inverse Functions

f is **self-inverse** if f(f(x)) = x, meaning f⁻¹(x) = f(x).

**Example:** Show f(x) = (x + 1)/(x − 1) is self-inverse.
```
f(f(x)) = f((x+1)/(x−1))

         = ((x+1)/(x−1) + 1) / ((x+1)/(x−1) − 1)

Numerator:   (x+1)/(x−1) + 1 = (x+1 + x−1)/(x−1) = 2x/(x−1)
Denominator: (x+1)/(x−1) − 1 = (x+1 − x+1)/(x−1) = 2/(x−1)

f(f(x)) = [2x/(x−1)] / [2/(x−1)]
         = 2x/(x−1) × (x−1)/2
         = x  ✅

∴ f is self-inverse.
```

---

# PART I: HSC-STYLE EXAMINATION QUESTIONS

---

## Level 1 (2–3 marks each)

1. Find the domain and range of  f(x) = √(9 − x²)

2. Find the inverse of  f(x) = (x − 3) / (2x + 1)

3. Given f(x) = 2x − 5, find the value of a if f(a) = f(2a) − 3

4. Simplify the difference quotient [f(x+h) − f(x)] / h  for  f(x) = x² − 3x

5. Determine whether f(x) = x / (x⁴ + x²) is odd, even, or neither

---

## Level 2 (4–5 marks each)

6. f(x) = x² − 4x + 3,  x ≥ 2
   (a) Complete the square to find the range of f
   (b) Find f⁻¹(x) and state its domain

7. f(x) = 3/(x−1) + 2 and g(x) = √(x−2)
   (a) Find f(g(x)) and simplify
   (b) Find the domain of f(g(x))

8. Find all values of k such that the equation |2x − k| = 3 has exactly one solution.

9. Sketch the graph of y = |x² − 4| and state the domain and range.

---

## Level 3 (6+ marks — HSC challenge)

10. f(x) = (ax + b)/(cx + d)  where ad − bc ≠ 0
    Show that f(f(x)) = x if and only if  a + d = 0.

11. A function f satisfies f(x) + 2f(1/x) = 3x for all x ≠ 0.
    Find an explicit formula for f(x).

12. f: [1, 3] → ℝ defined by f(x) = x² − 2x + 3
    (a) Find the range of f
    (b) Explain why f has an inverse if the domain is restricted to [1, 3]
    (c) Find f⁻¹(x) and state its domain

---

## Answers to HSC Questions

**1.**  9 − x² ≥ 0  →  x² ≤ 9  →  −3 ≤ x ≤ 3
   Domain: [−3, 3]
   f(x) = √(9−x²) is upper semicircle of radius 3.
   Range: [0, 3]

**2.**
```
y = (x−3)/(2x+1)
x = (y−3)/(2y+1)
x(2y+1) = y−3
2xy + x = y − 3
2xy − y = −x − 3
y(2x − 1) = −x − 3
y = (−x − 3)/(2x − 1) = −(x + 3)/(2x − 1)

f⁻¹(x) = −(x + 3)/(2x − 1)
```

**3.**
```
f(a) = 2a − 5
f(2a) − 3 = 2(2a) − 5 − 3 = 4a − 8
2a − 5 = 4a − 8
3 = 2a
a = 3/2
```

**4.**
```
f(x+h) = (x+h)² − 3(x+h) = x² + 2xh + h² − 3x − 3h
f(x+h) − f(x) = 2xh + h² − 3h = h(2x + h − 3)
[f(x+h)−f(x)]/h = 2x + h − 3
```

**5.**
```
f(x) = x/(x⁴+x²) = x/(x²(x²+1)) = 1/(x(x²+1))
f(−x) = 1/(−x(x²+1)) = −1/(x(x²+1)) = −f(x)   → ODD
```

**6.**
```
(a) f(x) = (x−2)² − 1.  Since x ≥ 2, (x−2)² ≥ 0, so f(x) ≥ −1.  Range: [−1, ∞)
(b) y = (x−2)² − 1,  x = (y−2)²−1 (swap)
    x+1 = (y−2)²
    √(x+1) = y−2   (take positive root since y ≥ 2)
    y = √(x+1) + 2
    f⁻¹(x) = √(x+1) + 2,  domain: x ≥ −1
```

**7.**
```
(a) f(g(x)) = 3/(√(x−2) − 1) + 2
(b) Need: x−2 ≥ 0 → x ≥ 2  AND  √(x−2) − 1 ≠ 0 → x ≠ 3
    Domain: [2, 3) ∪ (3, ∞)
```

**8.**  |2x − k| = 3 has exactly one solution only if both cases give the same x.
   2x − k = 3  →  x = (k+3)/2
   2x − k = −3  →  x = (k−3)/2
   These are equal when  k+3 = k−3, which is impossible.
   Alternatively: exactly one solution when the critical point is the solution, i.e. k = 3 or k = −3.
   Actually: |u| = 3 always gives 2 solutions unless... this has exactly one when both give same x, impossible.
   Wait — if c > 0, |u| = c always gives 2 solutions. Exactly one solution occurs only if c = 0.
   So |2x − k| = 3 has exactly ONE solution when... 3 > 0 always gives 2 solutions, NEVER one.
   (Correction: the question likely means |2x − k| = 3x or similar. As stated, answer: no such k exists.)

**11.**  The functional equation trick:
```
f(x) + 2f(1/x) = 3x         ... (1)
Replace x with 1/x:
f(1/x) + 2f(x) = 3/x        ... (2)

From (1): f(x) = 3x − 2f(1/x)
Substitute into (2):
f(1/x) + 2(3x − 2f(1/x)) = 3/x
f(1/x) + 6x − 4f(1/x) = 3/x
−3f(1/x) = 3/x − 6x
f(1/x) = 2x − 1/x

Substitute back into (1):
f(x) + 2(2/x − x) = 3x        [replacing 1/x → x means f(1/x) becomes f(x) with x→1/x... ]

Better approach: from (2): f(1/x) = 3/x − 2f(x)... substitute into (1):
f(x) + 2(3/x − 2f(x)) = 3x
f(x) + 6/x − 4f(x) = 3x
−3f(x) = 3x − 6/x
f(x) = −x + 2/x = 2/x − x
```

**12.**
```
(a) f(x) = (x−1)² + 2.  On [1,3]: at x=1, f=2; at x=3, f=6; minimum at x=1.  Range: [2, 6]
(b) On [1,3], f is increasing (vertex at x=1, left endpoint), so one-to-one → inverse exists.
(c) y = (x−1)² + 2, x ≥ 1
    x = (y−1)² + 2  (swap)
    x − 2 = (y−1)²
    √(x−2) = y − 1  (positive root since y ≥ 1)
    y = √(x−2) + 1
    f⁻¹(x) = √(x−2) + 1,   domain: [2, 6]  (= range of f)
```

---

# SUMMARY — EVERYTHING AT A GLANCE

```
FUNCTION:         One output per input.  Passes VLT.
DOMAIN:           All valid inputs.  Exclude: denom=0, √neg, log(≤0).
RANGE:            All possible outputs.  Use completing the square or algebra.
NOTATION:         f(a+h) means substitute (a+h) everywhere for x.
DIFFERENCE QUOT.: [f(x+h)−f(x)]/h  → foundation of calculus.
EVEN:             f(−x) = f(x)    → y-axis symmetry
ODD:              f(−x) = −f(x)   → origin symmetry
TRANSFORMATIONS:  y = af(b(x−h))+k
                    h: horizontal shift right
                    k: vertical shift up
                    a: vertical dilation / reflection if negative
                    b: horizontal dilation / reflection if negative
COMPOSITE:        f(g(x)) — find domain carefully.
INVERSE:          Swap x,y then solve. Needs one-to-one function.
                  dom(f⁻¹) = range(f).  Graph is reflection in y=x.
PIECEWISE:        Match input to correct rule. Check continuity at breaks.
```
