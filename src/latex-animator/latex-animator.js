import { LatexAnimatorRecorder } from './latex-animator-recorder.js';
import { LatexParticleEngine, sampleLinePoints } from './latex-particles.js';
import { sampleRelicForm } from './relic-forms.js';
import { rasterizeLines, buildGlyphSets, buildDiagramSprites, ZoomSim, CellSim } from './latex-cinema.js';

const TOKEN_NODES = new Set(['mi', 'mn', 'mo', 'mtext', 'ms', 'mspace']);

// Ready-made LaTeX sources. \var{} / \fn{} are the macros declared in the
// MathJax config in index.html — italic variable vs. upright function name.
const COMBINATION_OPERATORS = String.raw`$$ \fn{smin}(\var{a},\var{b},\var{k})=\big(\var{a}\,\var{h}+\var{b}(1-\var{h})\big)-\var{k}\,\var{h}(1-\var{h}),\qquad
   \var{h}=\fn{clamp}\!\Big(\tfrac12+\tfrac{\var{b}-\var{a}}{2\var{k}},\,0,\,1\Big) $$

$$ \fn{smax}(\var{a},\var{b},\var{k})=\big(\var{a}\,\var{h}+\var{b}(1-\var{h})\big)+\var{k}\,\var{h}(1-\var{h}),\qquad
   \var{h}=\fn{clamp}\!\Big(\tfrac12+\tfrac{\var{a}-\var{b}}{2\var{k}},\,0,\,1\Big) $$`;

const PRIMITIVES = String.raw`$$ \var{d}_{\fn{cyl}}(\var{p},\var{R},\var{H})=\min\!\big(\max(\var{d}_{\var{x}},\var{d}_{\var{y}}),0\big)+\big\lVert\max(\var{d},0)\big\rVert,
   \qquad \var{d}=\big(\,\lVert \var{p}_{\var{xz}}\rVert-\var{R},\;\; |\var{p}_{\var{y}}|-\var{H}\,\big) $$

$$ \var{d}_{\fn{tor}}(\var{p},\var{R},\var{t})=\Big\lVert\big(\,\lVert \var{p}_{\var{yz}}\rVert-\var{R},\;\;\var{p}_{\var{x}}\,\big)\Big\rVert-\var{t} $$`;

// Square cross-section torus: revolve, then a rounded box turned 45° about the
// section centre, so the square rides on its corner. eps is the rounding radius.
const XTORUS = String.raw`$$ \var{d}_{\fn{xtor}}(\var{p},\var{R},\var{r})=\min\!\big(\max(\var{d}_{\var{x}},\var{d}_{\var{y}}),0\big)+\big\lVert\max(\var{d},0)\big\rVert-\varepsilon $$

$$ \var{q}=\big(\,\lVert \var{p}_{\var{xz}}\rVert-\var{R},\;\;\var{p}_{\var{y}}\,\big),\qquad \varepsilon=\var{e}_{\fn{soft}}\,\var{r} $$

$$ \var{q}_{\fn{rot}}=\var{M}_{\varphi}\,\var{q},\qquad \var{M}_{\varphi}=\begin{pmatrix}\cos\varphi & -\sin\varphi\\ \sin\varphi & \cos\varphi\end{pmatrix},\qquad \varphi=\tfrac{\pi}{4} $$

$$ \var{d}=\big|\var{q}_{\fn{rot}}\big|-\max(\var{r}-\varepsilon,\,0)\,\mathbf{1} $$`;

// The full Snowflake SDF from sdf-playground (flurry parametric system),
// transcribed from the GLSL (snow_* functions in main.js). Order follows the
// evaluation: field & symmetry frames → diamond-torus primitive → ring
// components (center / neighbors / complete tori) → swords & outer ring →
// hook → warps + Jacobian → cutouts & corner soften → pairwise composition
// → grid repetition.
const SNOWFLAKE = String.raw`$$ \var{d}_{\fn{snow}}(\var{p})=\sigma\,\var{J}\cdot\fn{form}(\var{p}/\sigma),\qquad
   \fn{bound}(\var{p})=\lVert\var{p}\rVert-6 $$

$$ \fn{smin}(\var{a},\var{b},\var{k})=\big(\var{a}\,\var{h}+\var{b}(1-\var{h})\big)-\var{k}\,\var{h}(1-\var{h}),\qquad
   \var{h}=\fn{clamp}\!\Big(\tfrac12+\tfrac{\var{b}-\var{a}}{2\var{k}},\,0,\,1\Big) $$

$$ \fn{smax}(\var{a},\var{b},\var{k})=\big(\var{a}\,\var{h}+\var{b}(1-\var{h})\big)+\var{k}\,\var{h}(1-\var{h}),\qquad
   \var{h}=\fn{clamp}\!\Big(\tfrac12+\tfrac{\var{a}-\var{b}}{2\var{k}},\,0,\,1\Big) $$

$$ \Delta=\frac{2\pi}{\var{N}},\qquad
   \alpha_{0}=\Big\lfloor\frac{\alpha}{\Delta}+\frac12\Big\rfloor\,\Delta $$

$$ \alpha=\fn{atan}(\var{p}_{\var{z}},\var{p}_{\var{y}}),\qquad
   \delta=\alpha-\alpha_{0} $$

$$ \var{T}_{\var{m}}(\var{p})=\var{M}^{\var{xy}}_{\pi/2}\Big(\var{M}^{\var{yz}}_{-(\alpha_{0}+\var{m}\Delta)}\,\var{p}-\var{y}_{0}\,\mathbf{e}_{\var{y}}\Big) $$

$$ \var{M}_{\theta}=\begin{pmatrix}\cos\theta&-\sin\theta\\ \sin\theta&\cos\theta\end{pmatrix} $$

$$ \var{d}_{\fn{dt}}(\var{p},\var{R},\var{r})=\min\!\big(\max(\var{q}_{\var{x}},\var{q}_{\var{y}}),0\big)+\lVert\max(\var{q},0)\rVert-\varepsilon $$

$$ \var{r}(\theta)=\var{r}_{2}+(\var{r}_{1}-\var{r}_{2})\,\frac{1+\cos\theta}{2},\qquad
   \theta=\fn{atan}(\var{p}_{\var{z}},\var{p}_{\var{x}}) $$

$$ \var{q}=\Big|\var{M}_{\pi/4}\big(\lVert\var{p}_{\var{xz}}\rVert-\var{R},\;\var{p}_{\var{y}}\big)\Big|-\max(\var{r}-\varepsilon,\,0)\,\mathbf{1},\;\;
   \varepsilon=\var{e}_{\fn{soft}}\,\var{r} $$

$$ \var{d}_{\var{m}}=\var{d}_{\fn{dt}}\big(\var{T}_{\var{m}}(\var{p}),\,\var{R},\,\var{r}\big),\;\;
   \fn{conc}(\var{p})=\min_{0\le \var{i}<\var{n}}\var{d}_{\fn{dt}}\big(\var{p},\,\var{R}+\var{i}\,\var{s},\,\var{r}\big) $$

$$ \var{d}_{\fn{MC}}=\fn{smin}\Big(\fn{conc}\big(\var{T}_{0}(\var{p})\big),\quad\fn{conc}\big(\var{T}_{\fn{sgn}\,\delta}(\var{p})\big),\quad\var{k}_{\fn{MCMC}}\Big) $$

$$ \var{d}_{\fn{MN}}=\fn{smin}\big(\var{d}_{-1},\,\var{d}_{+1},\,\var{k}_{\fn{MNMN}}+\var{k}_{\fn{fl}}\big),\qquad
   \var{k}_{\fn{fl}}=\var{F}\cdot\fn{sstep}\big(0.1\,\Delta,\;0.5\,\Delta,\;|\delta|\big) $$

$$ \var{d}_{0}'=\max\Big(\var{d}_{0},\;\lVert\var{p}_{\var{yz}}\rVert\,\sin\!\big(\tfrac{\Delta}{2}-|\delta|\big)-\var{k}_{\var{c}}\Big),\;\;
   \var{c}_{\var{i}}=\max\Big(\big\lVert\var{T}_{\var{i}}(\var{p})_{\var{xz}}\big\rVert-\var{R},\;\big|\var{T}_{\var{i}}(\var{p})_{\var{y}}\big|-\sqrt{2}\,\var{r}\Big) $$

$$ \var{d}_{\fn{MN}}'=\max\Big(\fn{smin}(\var{d}_{\fn{MN}},\,\var{d}_{0}',\,\var{k}_{\var{c}}),\;\min(\var{d}_{\fn{MN}},\,\ell)\Big),\quad
   \ell=\min\!\big(\max(\var{c}_{0},\var{c}_{1}),\,\max(\var{c}_{0},\var{c}_{2})\big) $$

$$ \var{d}_{\fn{ct}}=\min\Big(\min_{|\var{m}|\le2}\var{d}_{\var{m}},\;\fn{smin}(\var{d}_{0},\var{d}_{\fn{sgn}\,\delta},\var{k}),\;\fn{smin}(\var{d}_{-1},\var{d}_{+1},\var{k}),\;\fn{smin}(\var{d}_{-2},\var{d}_{+2},\var{k})\Big) $$

$$ \var{d}_{\fn{SC}},\,\var{d}_{\fn{SN}}\;=\;\fn{same rings with}\;\;\var{N}\to\var{N}_{\fn{sec}},\quad \var{p}\to\var{M}^{\var{yz}}_{\beta}\,\var{p} $$

$$ \var{d}_{\fn{box}}(\var{p},\var{s},\rho)=\lVert\max(\var{b},0)\rVert+\min\!\big(\max(\var{b}_{\var{x}},\var{b}_{\var{y}},\var{b}_{\var{z}}),0\big)-\rho,\qquad
   \var{b}=\big|\var{M}^{\var{xz}}_{\pi/4}\,\var{p}\big|-(\var{s}-\rho)\,\mathbf{1} $$

$$ \var{w}(\var{y})=\var{w}_{0}\Big((1-\tau)+\tau\,\fn{clamp}\big(\tfrac{|\var{y}|}{\var{L}},\,0,\,1\big)\Big) $$

$$ \var{d}_{\fn{rays}}=\fn{smin}\Big(\var{d}_{\fn{sw},0},\;\fn{smin}(\var{d}_{\fn{sw},-1},\,\var{d}_{\fn{sw},+1},\,\var{k}_{\fn{sw}}),\;\var{k}_{\fn{sw}}\Big) $$

$$ \var{d}_{\fn{SW}}=\fn{smin}\Big(\fn{smax}\big(\var{d}_{\fn{out}},\,\var{d}_{\fn{sub}},\,\var{k}_{\var{o}}\big),\;\var{d}_{\fn{rays}},\;\var{k}_{\fn{sw}}\Big),\qquad
   \var{d}_{\fn{out}}=\Big\lVert\big(\lVert\var{p}_{\var{yz}}\rVert-\var{R}_{\var{o}},\;\var{p}_{\var{x}}\big)\Big\rVert-\var{t}_{\var{o}} $$

$$ \var{d}_{\fn{HK}}=\max\Big(\fn{smax}\big(-\var{d}_{\fn{cyl}},\;\max(-\var{d}_{\fn{mask}},\;\var{d}_{\fn{S}}),\;0\big),\;\var{p}_{\var{x}}\Big) $$

$$ \var{d}_{\fn{S}}=\min\Big(\fn{arc}\big(\mathbf{0},\,\var{R},\,\theta_{\var{s}}\!\to\!\theta_{\var{t}}\big),\;
   \fn{arc}\big(2\var{T},\,\var{R},\,\theta_{\var{t}}+\pi\!\to\!\theta_{\var{t}}+\pi-\theta_{\fn{sw}}\big)\Big),\qquad
   \var{T}=\var{R}\,(\cos\theta_{\var{t}},\,\sin\theta_{\var{t}}) $$

$$ \var{p}_{\var{x}}\leftarrow\var{p}_{\var{x}}-\fn{sgn}(\var{A})\Big(\rho_{\var{s}}-\sqrt{\rho_{\var{s}}^{2}-\var{r}_{\var{c}}^{2}}\Big),\qquad
   \rho_{\var{s}}=\frac{\var{R}_{\var{b}}}{|\var{A}|},\qquad
   \var{r}_{\var{c}}=\min\!\big(\lVert\var{p}_{\var{yz}}\rVert,\,0.99\,\rho_{\var{s}}\big) $$

$$ \var{p}_{\var{x}}\leftarrow\var{p}_{\var{x}}-\var{A}_{\var{w}}\sin\!\big(\var{f}\,(\var{p}_{\var{y}}\cos\psi+\var{p}_{\var{z}}\sin\psi)+\varphi\big) $$

$$ \var{J}=\frac{1}{\sqrt{1+\max(\var{s}_{\var{P}}^{2},\,\var{s}_{\var{S}}^{2})}},\qquad
   \var{s}=\frac{\var{r}_{\var{c}}}{\sqrt{\rho_{\var{s}}^{2}-\var{r}_{\var{c}}^{2}}}+|\var{A}_{\var{w}}|\,\var{f} $$

$$ \var{d}\leftarrow\fn{smax}\big(\var{d},\,-(\lVert\var{p}\rVert-\var{R}_{\var{c}}),\,\var{k}\big),\qquad
   \var{d}\leftarrow\fn{smax}\big(\var{d},\,-\var{d}_{\fn{out}}(\var{p};\var{R}_{\fn{oc}},\var{s}_{\fn{oc}}),\,\var{k}\big) $$

$$ \fn{form}\leftarrow\fn{smax}\big(\fn{form},\,-\fn{dome},\,\var{k}_{\fn{cs}}\big),\qquad
   \fn{dome}=\max\!\big(\max(\fn{cyl},\,-\fn{sph}),\;\fn{rod}\big) $$

$$ \fn{form}=\min_{\{\var{i},\var{j}\}\subset\{\fn{MC},\fn{MN},\fn{SC},\fn{SN},\fn{SW},\fn{HK}\}}\fn{smin}\big(\var{d}_{\var{i}},\,\var{d}_{\var{j}},\,\var{k}_{\var{ij}}\big) $$

$$ \var{d}_{\fn{grid}}(\var{p})=\min_{\var{c}\in\{-1,0,1\}^{2}}\var{d}_{\fn{snow}}\big(\var{p}-\var{s}\,(0,\,\var{c}_{1},\,\var{c}_{2})\big) $$`;

// Annotated walkthrough of the same snowflake SDF: section headings and
// short descriptions interleaved with the equations. Prose lives INSIDE
// math blocks (\textbf / \textit) so it animates and captures like any
// glyph — plain text between $$ blocks would neither reveal nor rasterize.
const SNOWFLAKE_GUIDE = String.raw`$$ \huge\textbf{The Snowflake} $$

$$ \textit{how the flurry SDF grows a snowflake, one distance at a time} $$

$$ \rule{16em}{0.5pt} $$

$$ \Large\textbf{I · The Field} $$

$$ \textit{One signed distance defines the whole flake. Rays march it,}\;\;\sigma\;\textit{scales it,} $$

$$ \var{J}\;\textit{repairs it after warping, and a radius-6 bound skips empty space.} $$

$$ \var{d}_{\fn{snow}}(\var{p})=\sigma\,\var{J}\cdot\fn{form}(\var{p}/\sigma),\qquad
   \fn{bound}(\var{p})=\lVert\var{p}\rVert-6 $$

$$ \rule{16em}{0.5pt} $$

$$ \Large\textbf{II · Smooth Joins} $$

$$ \textit{Every union in the flake is a polynomial smooth-min:}\;\var{k}\;\textit{is the meniscus} $$

$$ \textit{radius,}\;\var{h}\;\textit{the crossfade. Its mirror, smax, carves instead of joins.} $$

$$ \fn{smin}(\var{a},\var{b},\var{k})=\big(\var{a}\,\var{h}+\var{b}(1-\var{h})\big)-\var{k}\,\var{h}(1-\var{h}),\qquad
   \var{h}=\fn{clamp}\!\Big(\tfrac12+\tfrac{\var{b}-\var{a}}{2\var{k}},\,0,\,1\Big) $$

$$ \fn{smax}(\var{a},\var{b},\var{k})=\big(\var{a}\,\var{h}+\var{b}(1-\var{h})\big)+\var{k}\,\var{h}(1-\var{h}),\qquad
   \var{h}=\fn{clamp}\!\Big(\tfrac12+\tfrac{\var{a}-\var{b}}{2\var{k}},\,0,\,1\Big) $$

$$ \rule{16em}{0.5pt} $$

$$ \Large\textbf{III · Sixfold Symmetry} $$

$$ \textit{Space folds around the nearest of}\;\var{N}\;\textit{spokes: find its angle}\;\alpha_{0}\textit{, and} $$

$$ \var{T}_{\var{m}}\;\textit{carries a point into the frame of spoke}\;\var{m}\textit{, out along it by}\;\var{y}_{0}\textit{,} $$

$$ \textit{then tips it into the ring plane. Model one spoke — get all}\;\var{N}\textit{.} $$

$$ \Delta=\frac{2\pi}{\var{N}},\qquad
   \alpha_{0}=\Big\lfloor\frac{\alpha}{\Delta}+\frac12\Big\rfloor\,\Delta $$

$$ \alpha=\fn{atan}(\var{p}_{\var{z}},\var{p}_{\var{y}}),\qquad
   \delta=\alpha-\alpha_{0} $$

$$ \var{T}_{\var{m}}(\var{p})=\var{M}^{\var{xy}}_{\pi/2}\Big(\var{M}^{\var{yz}}_{-(\alpha_{0}+\var{m}\Delta)}\,\var{p}-\var{y}_{0}\,\mathbf{e}_{\var{y}}\Big) $$

$$ \var{M}_{\theta}=\begin{pmatrix}\cos\theta&-\sin\theta\\ \sin\theta&\cos\theta\end{pmatrix} $$

$$ \rule{16em}{0.5pt} $$

$$ \Large\textbf{IV · The Diamond Torus} $$

$$ \textit{The one primitive nearly everything is made of: a ring whose square} $$

$$ \textit{cross-section stands on its corner. A cosine taper thins the section} $$

$$ \textit{as it travels around the ring;}\;\;\varepsilon\;\textit{melts the edges.} $$

$$ \var{d}_{\fn{dt}}(\var{p},\var{R},\var{r})=\min\!\big(\max(\var{q}_{\var{x}},\var{q}_{\var{y}}),0\big)+\lVert\max(\var{q},0)\rVert-\varepsilon $$

$$ \var{r}(\theta)=\var{r}_{2}+(\var{r}_{1}-\var{r}_{2})\,\frac{1+\cos\theta}{2},\qquad
   \theta=\fn{atan}(\var{p}_{\var{z}},\var{p}_{\var{x}}) $$

$$ \var{q}=\Big|\var{M}_{\pi/4}\big(\lVert\var{p}_{\var{xz}}\rVert-\var{R},\;\var{p}_{\var{y}}\big)\Big|-\max(\var{r}-\varepsilon,\,0)\,\mathbf{1},\;\;
   \varepsilon=\var{e}_{\fn{soft}}\,\var{r} $$

$$ \rule{16em}{0.5pt} $$

$$ \Large\textbf{V · Rings, Centers, Neighbors} $$

$$ \textit{A ring hangs on every spoke — and on its neighbors, blended pairwise.} $$

$$ \fn{conc}\;\textit{nests up to five concentric copies outward by spacing}\;\var{s}\textit{.} $$

$$ \var{d}_{\var{m}}=\var{d}_{\fn{dt}}\big(\var{T}_{\var{m}}(\var{p}),\,\var{R},\,\var{r}\big),\;\;
   \fn{conc}(\var{p})=\min_{0\le \var{i}<\var{n}}\var{d}_{\fn{dt}}\big(\var{p},\,\var{R}+\var{i}\,\var{s},\,\var{r}\big) $$

$$ \var{d}_{\fn{MC}}=\fn{smin}\Big(\fn{conc}\big(\var{T}_{0}(\var{p})\big),\quad\fn{conc}\big(\var{T}_{\fn{sgn}\,\delta}(\var{p})\big),\quad\var{k}_{\fn{MCMC}}\Big) $$

$$ \textit{Neighbor rings bloom: the flower gain}\;\var{k}_{\fn{fl}}\;\textit{swells the blend between} $$

$$ \textit{spokes, so rings fuse mid-petal and stay crisp on the spine.} $$

$$ \var{d}_{\fn{MN}}=\fn{smin}\big(\var{d}_{-1},\,\var{d}_{+1},\,\var{k}_{\fn{MNMN}}+\var{k}_{\fn{fl}}\big),\qquad
   \var{k}_{\fn{fl}}=\var{F}\cdot\fn{sstep}\big(0.1\,\Delta,\;0.5\,\Delta,\;|\delta|\big) $$

$$ \textit{The crease: the center ring is clipped to a wedge at the fold seam, then} $$

$$ \textit{re-joined softly; a cylinder-lens keeps the union from inflating.} $$

$$ \var{d}_{0}'=\max\Big(\var{d}_{0},\;\lVert\var{p}_{\var{yz}}\rVert\,\sin\!\big(\tfrac{\Delta}{2}-|\delta|\big)-\var{k}_{\var{c}}\Big),\;\;
   \var{c}_{\var{i}}=\max\Big(\big\lVert\var{T}_{\var{i}}(\var{p})_{\var{xz}}\big\rVert-\var{R},\;\big|\var{T}_{\var{i}}(\var{p})_{\var{y}}\big|-\sqrt{2}\,\var{r}\Big) $$

$$ \var{d}_{\fn{MN}}'=\max\Big(\fn{smin}(\var{d}_{\fn{MN}},\,\var{d}_{0}',\,\var{k}_{\var{c}}),\;\min(\var{d}_{\fn{MN}},\,\ell)\Big),\quad
   \ell=\min\!\big(\max(\var{c}_{0},\var{c}_{1}),\,\max(\var{c}_{0},\var{c}_{2})\big) $$

$$ \textit{Complete tori: five whole rings around the nearest spoke, filleted where} $$

$$ \textit{they cross — the bisector trick puffs true crossings and nothing else.} $$

$$ \var{d}_{\fn{ct}}=\min\Big(\min_{|\var{m}|\le2}\var{d}_{\var{m}},\;\fn{smin}(\var{d}_{0},\var{d}_{\fn{sgn}\,\delta},\var{k}),\;\fn{smin}(\var{d}_{-1},\var{d}_{+1},\var{k}),\;\fn{smin}(\var{d}_{-2},\var{d}_{+2},\var{k})\Big) $$

$$ \textit{A second, independent ring system repeats all of the above at its own} $$

$$ \textit{spoke count and rotation — the inner lacework behind the main form.} $$

$$ \var{d}_{\fn{SC}},\,\var{d}_{\fn{SN}}\;=\;\fn{same rings with}\;\;\var{N}\to\var{N}_{\fn{sec}},\quad \var{p}\to\var{M}^{\var{yz}}_{\beta}\,\var{p} $$

$$ \rule{16em}{0.5pt} $$

$$ \Large\textbf{VI · Swords and the Outer Ring} $$

$$ \textit{The spokes themselves: rounded boxes turned 45°, pinched toward the} $$

$$ \textit{center by the taper}\;\var{w}(\var{y})\textit{. A torus about the flake normal binds their tips,} $$

$$ \textit{riding on a thinner substrate copy of the same swords.} $$

$$ \var{d}_{\fn{box}}(\var{p},\var{s},\rho)=\lVert\max(\var{b},0)\rVert+\min\!\big(\max(\var{b}_{\var{x}},\var{b}_{\var{y}},\var{b}_{\var{z}}),0\big)-\rho,\qquad
   \var{b}=\big|\var{M}^{\var{xz}}_{\pi/4}\,\var{p}\big|-(\var{s}-\rho)\,\mathbf{1} $$

$$ \var{w}(\var{y})=\var{w}_{0}\Big((1-\tau)+\tau\,\fn{clamp}\big(\tfrac{|\var{y}|}{\var{L}},\,0,\,1\big)\Big) $$

$$ \var{d}_{\fn{rays}}=\fn{smin}\Big(\var{d}_{\fn{sw},0},\;\fn{smin}(\var{d}_{\fn{sw},-1},\,\var{d}_{\fn{sw},+1},\,\var{k}_{\fn{sw}}),\;\var{k}_{\fn{sw}}\Big) $$

$$ \var{d}_{\fn{SW}}=\fn{smin}\Big(\fn{smax}\big(\var{d}_{\fn{out}},\,\var{d}_{\fn{sub}},\,\var{k}_{\var{o}}\big),\;\var{d}_{\fn{rays}},\;\var{k}_{\fn{sw}}\Big),\qquad
   \var{d}_{\fn{out}}=\Big\lVert\big(\lVert\var{p}_{\var{yz}}\rVert-\var{R}_{\var{o}},\;\var{p}_{\var{x}}\big)\Big\rVert-\var{t}_{\var{o}} $$

$$ \rule{16em}{0.5pt} $$

$$ \Large\textbf{VII · The Hook} $$

$$ \textit{An S-shaped ornament: two circular arcs of diamond section, the second} $$

$$ \textit{orbiting the mirrored center}\;2\var{T}\textit{, sliced flat by a cylinder and masked.} $$

$$ \var{d}_{\fn{HK}}=\max\Big(\fn{smax}\big(-\var{d}_{\fn{cyl}},\;\max(-\var{d}_{\fn{mask}},\;\var{d}_{\fn{S}}),\;0\big),\;\var{p}_{\var{x}}\Big) $$

$$ \var{d}_{\fn{S}}=\min\Big(\fn{arc}\big(\mathbf{0},\,\var{R},\,\theta_{\var{s}}\!\to\!\theta_{\var{t}}\big),\;
   \fn{arc}\big(2\var{T},\,\var{R},\,\theta_{\var{t}}+\pi\!\to\!\theta_{\var{t}}+\pi-\theta_{\fn{sw}}\big)\Big),\qquad
   \var{T}=\var{R}\,(\cos\theta_{\var{t}},\,\sin\theta_{\var{t}}) $$

$$ \rule{16em}{0.5pt} $$

$$ \Large\textbf{VIII · Warps} $$

$$ \textit{The flat flake dishes into a bowl — a spherical-cap displacement along} $$

$$ \textit{the normal — and a sine wave ripples across it. Displacement slopes add;} $$

$$ \textit{one conservative Jacobian}\;\var{J}\;\textit{keeps every marched distance safe.} $$

$$ \var{p}_{\var{x}}\leftarrow\var{p}_{\var{x}}-\fn{sgn}(\var{A})\Big(\rho_{\var{s}}-\sqrt{\rho_{\var{s}}^{2}-\var{r}_{\var{c}}^{2}}\Big),\qquad
   \rho_{\var{s}}=\frac{\var{R}_{\var{b}}}{|\var{A}|},\qquad
   \var{r}_{\var{c}}=\min\!\big(\lVert\var{p}_{\var{yz}}\rVert,\,0.99\,\rho_{\var{s}}\big) $$

$$ \var{p}_{\var{x}}\leftarrow\var{p}_{\var{x}}-\var{A}_{\var{w}}\sin\!\big(\var{f}\,(\var{p}_{\var{y}}\cos\psi+\var{p}_{\var{z}}\sin\psi)+\varphi\big) $$

$$ \var{J}=\frac{1}{\sqrt{1+\max(\var{s}_{\var{P}}^{2},\,\var{s}_{\var{S}}^{2})}},\qquad
   \var{s}=\frac{\var{r}_{\var{c}}}{\sqrt{\rho_{\var{s}}^{2}-\var{r}_{\var{c}}^{2}}}+|\var{A}_{\var{w}}|\,\var{f} $$

$$ \rule{16em}{0.5pt} $$

$$ \Large\textbf{IX · Cutouts and Softening} $$

$$ \textit{Carving is subtraction: smax against a negated sphere opens the center;} $$

$$ \textit{against a negated torus, an annular window. Domes parked on the fold} $$

$$ \textit{midlines melt the sharp outer corners.} $$

$$ \var{d}\leftarrow\fn{smax}\big(\var{d},\,-(\lVert\var{p}\rVert-\var{R}_{\var{c}}),\,\var{k}\big),\qquad
   \var{d}\leftarrow\fn{smax}\big(\var{d},\,-\var{d}_{\fn{out}}(\var{p};\var{R}_{\fn{oc}},\var{s}_{\fn{oc}}),\,\var{k}\big) $$

$$ \fn{form}\leftarrow\fn{smax}\big(\fn{form},\,-\fn{dome},\,\var{k}_{\fn{cs}}\big),\qquad
   \fn{dome}=\max\!\big(\max(\fn{cyl},\,-\fn{sph}),\;\fn{rod}\big) $$

$$ \rule{16em}{0.5pt} $$

$$ \Large\textbf{X · Composition} $$

$$ \textit{Six components — center rings, neighbor rings, their secondary twins,} $$

$$ \textit{swords, hook — meet pairwise, every pair with its own blend radius.} $$

$$ \fn{form}=\min_{\{\var{i},\var{j}\}\subset\{\fn{MC},\fn{MN},\fn{SC},\fn{SN},\fn{SW},\fn{HK}\}}\fn{smin}\big(\var{d}_{\var{i}},\,\var{d}_{\var{j}},\,\var{k}_{\var{ij}}\big) $$

$$ \textit{And to fill a sky: repeat the field over a}\;3\times3\;\textit{neighborhood of cells.} $$

$$ \var{d}_{\fn{grid}}(\var{p})=\min_{\var{c}\in\{-1,0,1\}^{2}}\var{d}_{\fn{snow}}\big(\var{p}-\var{s}\,(0,\,\var{c}_{1},\,\var{c}_{2})\big) $$

$$ \rule{16em}{0.5pt} $$

$$ \textit{one field, twenty-five snowflakes} $$`;

// The Ephemeris Ring — everything from sdf-playground's
// ring_solar_equations_editorial.html: the signet-band SDF (cylinder & torus
// primitives, smooth joins, component shapes, assembly), Kepler's laws and
// equation, the underlying dynamics, the full ephemeris pipeline, and the
// decorative ring ephemeris it actually runs. Headings live inside math
// blocks (\textbf/\textit) so they animate and capture like any glyph.
const EPHEMERIS_RING = String.raw`$$ \huge\textbf{The Ephemeris Ring} $$

$$ \textit{a signet band that carries the solar system — cylinder, torus, Kepler} $$

$$ \rule{16em}{0.5pt} $$

$$ \Large\textbf{I · Smooth Joins} $$

$$ \fn{smin}(\var{a},\var{b},\var{k})=\big(\var{a}\,\var{h}+\var{b}(1-\var{h})\big)-\var{k}\,\var{h}(1-\var{h}),\qquad
   \var{h}=\fn{clamp}\!\Big(\tfrac12+\tfrac{\var{b}-\var{a}}{2\var{k}},\,0,\,1\Big) $$

$$ \fn{smax}(\var{a},\var{b},\var{k})=\big(\var{a}\,\var{h}+\var{b}(1-\var{h})\big)+\var{k}\,\var{h}(1-\var{h}),\qquad
   \var{h}=\fn{clamp}\!\Big(\tfrac12+\tfrac{\var{a}-\var{b}}{2\var{k}},\,0,\,1\Big) $$

$$ \rule{16em}{0.5pt} $$

$$ \Large\textbf{II · Primitives} $$

$$ \var{d}_{\fn{cyl}}(\var{p},\var{R},\var{H})=\min\!\big(\max(\var{d}_{\var{x}},\var{d}_{\var{y}}),0\big)+\big\lVert\max(\var{d},0)\big\rVert,
   \qquad \var{d}=\big(\,\lVert \var{p}_{\var{xz}}\rVert-\var{R},\;\; |\var{p}_{\var{y}}|-\var{H}\,\big) $$

$$ \var{d}_{\fn{tor}}(\var{p},\var{R},\var{t})=\Big\lVert\big(\,\lVert \var{p}_{\var{yz}}\rVert-\var{R},\;\;\var{p}_{\var{x}}\,\big)\Big\rVert-\var{t} $$

$$ \rule{16em}{0.5pt} $$

$$ \Large\textbf{III · Component Shapes} $$

$$ \var{r}(\var{q})=\var{d}_{\fn{cyl}}(\var{q}+\var{c}_{\var{r}},\ \var{R}_{\var{r}},\ \var{H}_{\var{r}}) $$

$$ \var{T}(\var{q})=\var{d}_{\fn{cyl}}(\var{q}+\var{c}_{\var{T}},\ \var{R}_{\var{T}},\ \var{H}_{\var{T}}) $$

$$ \var{B}(\var{q})=\var{d}_{\fn{tor}}(\var{S}\,\var{q}+\var{c}_{\var{B}},\ \var{R}_{\var{B}},\ \var{t}_{\var{B}}),\;\; \var{S}=\fn{diag}(\var{s},1,1) $$

$$ \var{D}(\var{q})=\var{d}_{\fn{cyl}}(\var{M}_{\varphi}\,(\var{q}+\var{c}_{\var{B}}),\ \var{R}_{\var{D}},\ \var{H}_{\var{D}}),\;\; \var{M}_{\varphi}=\fn{Rot}_{\var{xy}}(\varphi) $$

$$ \rule{16em}{0.5pt} $$

$$ \Large\textbf{IV · Assembly} $$

$$ \var{B}_1=\fn{smin}(\var{r},\;\var{B},\;\var{k}_1) $$

$$ \var{B}_2=\fn{smin}(\var{T},\;\var{B}_1,\;\var{k}_2) $$

$$ \var{B}_3=\fn{smax}(\var{B}_2,\;-\var{V},\;\var{k}_3) $$

$$ \fn{signet}(\var{p})=\max(-\var{D},\;\var{B}_3) $$

$$ \fn{signet}(\var{p})=\max\!\big(-\var{D},\;\fn{smax}(\fn{smin}(\var{T},\;\fn{smin}(\var{r},\var{B},\var{k}_1),\;\var{k}_2),\;-\var{V},\;\var{k}_3)\big) $$

$$ \rule{16em}{0.5pt} $$

$$ \Large\textbf{V · First Law — Ellipse} $$

$$ \var{r}(\theta)=\frac{\var{a}\,(1-\var{e}^{2})}{1+\var{e}\cos\theta} $$

$$ \var{r}_{\min}=\var{a}(1-\var{e}),\qquad \var{r}_{\max}=\var{a}(1+\var{e}),\qquad \var{b}=\var{a}\sqrt{1-\var{e}^{2}} $$

$$ \Large\textbf{VI · Second Law — Equal Areas} $$

$$ \frac{\var{d}\var{A}}{\var{d}\var{t}}=\tfrac{1}{2}\,\var{r}^{2}\,\dot\theta=\frac{\var{L}}{2\var{m}}=\fn{const} $$

$$ \var{A}_{\fn{ellipse}}=\pi \var{a}\var{b}=\tfrac12\,\var{h}\,\var{T},\qquad \var{h}=\var{r}^{2}\dot\theta $$

$$ \Large\textbf{VII · Third Law — Period vs. Size} $$

$$ \var{T}^{2}=\frac{4\pi^{2}}{\var{G}\,(\var{M}+\var{m})}\;\var{a}^{3}\;\approx\;\frac{4\pi^{2}}{\var{G}\,\var{M}_{\odot}}\,\var{a}^{3} $$

$$ \rule{16em}{0.5pt} $$

$$ \Large\textbf{VIII · Kepler's Equation — Time → Position} $$

$$ \var{M}=\var{n}\,(\var{t}-\var{t}_0),\qquad \var{n}=\frac{2\pi}{\var{T}}=\sqrt{\frac{\var{G}(\var{M}_{\star}+\var{m})}{\var{a}^{3}}} $$

$$ \var{M}=\var{E}-\var{e}\sin \var{E} $$

$$ \var{E}_{\var{k}+1}=\var{E}_{\var{k}}-\frac{\var{E}_{\var{k}}-\var{e}\sin \var{E}_{\var{k}}-\var{M}}{1-\var{e}\cos \var{E}_{\var{k}}},\qquad \var{E}_0=\var{M} $$

$$ \tan\frac{\theta}{2}=\sqrt{\frac{1+\var{e}}{1-\var{e}}}\;\tan\frac{\var{E}}{2},\qquad \var{r}=\var{a}\,(1-\var{e}\cos \var{E}) $$

$$ \var{x}=\var{a}(\cos \var{E}-\var{e}),\qquad \var{y}=\var{a}\sqrt{1-\var{e}^{2}}\,\sin \var{E} $$

$$ \Large\textbf{IX · Underlying Dynamics} $$

$$ \ddot{\var{r}}=-\,\frac{\var{G}(\var{M}+\var{m})}{\var{r}^{2}}\,\hat{\var{r}},\qquad \mu \equiv \var{G}(\var{M}+\var{m}) $$

$$ \varepsilon=\frac{\var{v}^{2}}{2}-\frac{\mu}{\var{r}}=-\frac{\mu}{2\var{a}},\qquad \var{h}=\var{r}^{2}\dot\theta=\sqrt{\mu\,\var{a}\,(1-\var{e}^{2})} $$

$$ \var{v}(\var{r})=\sqrt{\mu\!\left(\frac{2}{\var{r}}-\frac{1}{\var{a}}\right)} $$

$$ \rule{16em}{0.5pt} $$

$$ \Large\textbf{X · Ephemeris Pipeline} $$

$$ \textit{date → Julian Day → centuries past J2000} $$

$$ \var{A}=\Big\lfloor\tfrac{\var{Y}}{100}\Big\rfloor,\qquad \var{B}=2-\var{A}+\Big\lfloor\tfrac{\var{A}}{4}\Big\rfloor $$

$$ \fn{JD}=\big\lfloor 365.25\,(\var{Y}+4716)\big\rfloor+\big\lfloor 30.6001\,(\var{M}+1)\big\rfloor+\var{D}+\var{B}-1524.5 $$

$$ \var{T}=\frac{\fn{JD}-2451545.0}{36525} $$

$$ \textit{element propagation} $$

$$ \var{a}(\var{T})=\var{a}_0+\dot{\var{a}}\,\var{T},\qquad \var{e}(\var{T})=\var{e}_0+\dot{\var{e}}\,\var{T},\qquad \var{I}(\var{T})=\var{I}_0+\dot{\var{I}}\,\var{T} $$

$$ \var{L}(\var{T})=\var{L}_0+\dot{\var{L}}\,\var{T},\qquad \varpi(\var{T})=\varpi_0+\dot\varpi\,\var{T},\qquad \Omega(\var{T})=\Omega_0+\dot\Omega\,\var{T} $$

$$ \omega=\varpi-\Omega,\qquad \var{M}=\var{L}-\varpi $$

$$ \var{M}=\var{L}-\varpi+\var{b}\,\var{T}^{2}+\var{c}\cos(\var{f}\var{T})+\var{s}\sin(\var{f}\var{T}) $$

$$ \textit{solve (degree form)} $$

$$ \var{M}=\var{E}-\var{e}^{\!*}\sin \var{E},\quad \var{e}^{\!*}=\tfrac{180}{\pi}\,\var{e};\qquad
   \Delta \var{E}=\frac{\var{M}-(\var{E}-\var{e}^{\!*}\sin \var{E})}{1-\var{e}\cos \var{E}},\;\; \var{E}\!\leftarrow\!\var{E}+\Delta \var{E} $$

$$ \rule{16em}{0.5pt} $$

$$ \Large\textbf{XI · Orbital Plane → Ecliptic → Equatorial} $$

$$ \var{x}'=\var{a}\,(\cos \var{E}-\var{e}),\qquad \var{y}'=\var{a}\sqrt{1-\var{e}^{2}}\,\sin \var{E},\qquad \var{z}'=0 $$

$$ \begin{aligned}
   \var{x}_{\fn{ecl}}&=(\cos\omega\cos\Omega-\sin\omega\sin\Omega\cos \var{I})\,\var{x}'+(-\sin\omega\cos\Omega-\cos\omega\sin\Omega\cos \var{I})\,\var{y}'\\
   \var{y}_{\fn{ecl}}&=(\cos\omega\sin\Omega+\sin\omega\cos\Omega\cos \var{I})\,\var{x}'+(-\sin\omega\sin\Omega+\cos\omega\cos\Omega\cos \var{I})\,\var{y}'\\
   \var{z}_{\fn{ecl}}&=(\sin\omega\sin \var{I})\,\var{x}'+(\cos\omega\sin \var{I})\,\var{y}'
   \end{aligned} $$

$$ \var{r}_{\fn{ecl}}=\var{R}_{\var{z}}(\Omega)\,\var{R}_{\var{x}}(\var{I})\,\var{R}_{\var{z}}(\omega)\,\var{r}' $$

$$ \varepsilon=23.43928^\circ:\quad
   \var{x}_{\fn{eq}}=\var{x}_{\fn{ecl}},\quad
   \var{y}_{\fn{eq}}=\cos\varepsilon\,\var{y}_{\fn{ecl}}-\sin\varepsilon\,\var{z}_{\fn{ecl}},\quad
   \var{z}_{\fn{eq}}=\sin\varepsilon\,\var{y}_{\fn{ecl}}+\cos\varepsilon\,\var{z}_{\fn{ecl}} $$

$$ \rule{16em}{0.5pt} $$

$$ \Large\textbf{XII · The Ring Ephemeris} $$

$$ \var{d}=\frac{\var{t}_{\fn{unix}}-\var{t}_{\fn{J2000}}}{86400},\qquad \var{M}=\frac{2\pi}{\var{T}}\,\var{d}+\var{L}_0 $$

$$ \var{p}=\big(-\var{r}\cos \var{M},\ 0,\ \var{r}\sin \var{M}\big),\qquad \var{r}=\var{a} $$

$$ \rule{16em}{0.5pt} $$

$$ \textit{real periods, real mean longitudes — the angle on the date is true} $$`;

// Derived Ephemeris Ring variants — built from the annotated preset so they
// can't drift apart. Every English block (title, subtitle, headings,
// annotations) is stripped: \var/\fn expand to \textit/\text via macros, so
// equations never contain a literal \textbf/\textit — only prose does.
// splitClauses breaks multi-clause lines into separate blocks at ",\qquad" /
// ",\quad" — spacing-macro commas only, so commas inside argument lists and
// tuples are untouched. maxLen then drops long lines (compacted source
// length is a rough but monotonic proxy for rendered width). Rule
// separators are kept, but deduped and trimmed so emptied sections don't
// leave doubled rules.
// Rough count of a line's visible symbols: \var/\fn tokens, Greek letters,
// function names, numbers, and punctuation count 1 each; spacing, sizing,
// accents, and pure structure (braces, scripts, \frac) count 0.
const SYM_IGNORE = new Set([
  'qquad', 'quad', 'left', 'right', 'frac', 'tfrac', 'dfrac', 'hat', 'dot',
  'ddot', 'bar', 'vec', 'mathbf', 'text', 'textit', 'textbf', 'big', 'Big',
  'bigl', 'bigr', 'Bigl', 'Bigr', 'bigg', 'Bigg', 'biggl', 'biggr',
  'displaystyle', 'operatorname',
]);
function symbolCount(block) {
  const src = block.replace(/\$\$/g, '');
  let n = 0;
  const re = /\\(?:var|fn)\{[^}]*\}|\\[a-zA-Z]+|\\.|\d+(?:\.\d+)?|[a-zA-Z]|[^\s{}^_&]/g;
  for (const tok of src.match(re) || []) {
    if (tok[0] === '\\') {
      if (/^\\(?:var|fn)\{/.test(tok)) { n++; continue; }
      const name = tok.slice(1);
      if (/^[a-zA-Z]+$/.test(name) && !SYM_IGNORE.has(name)) n++;
      continue; // \, \; \! etc — spacing, count 0
    }
    n++;
  }
  return n;
}

function ephemerisMathBlocks({ maxLen = Infinity, splitClauses = false, maxSymbols = Infinity, drop = [] } = {}) {
  const isRule = (b) => b.includes('\\rule{');
  let blocks = EPHEMERIS_RING.split('\n\n')
    .filter(b => !b.includes('\\textbf{') && !b.includes('\\textit{'));
  if (splitClauses) {
    blocks = blocks.flatMap(b => {
      if (isRule(b)) return [b];
      return b.replace(/^\$\$\s*/, '').replace(/\s*\$\$$/, '')
        .split(/,\s*\\q?quad\s*/)
        .map(part => `$$ ${part.trim()} $$`);
    });
    // Lines cut from the short set outright.
    const DROP = [
      String.raw`+\var{b}\,\var{T}^{2}`, // M = L − ϖ + bT² + c cos(fT) + s sin(fT)
    ];
    blocks = blocks.filter(b => !DROP.some(key => b.includes(key)));
    // Lines whose commas are NOT clause separators (tuples, the obliquity
    // colon pair) — replaced with hand-written per-component lines so every
    // float item is a single statement.
    const REWRITES = [
      [String.raw`\var{d}=\big(`, [
        String.raw`\var{d}_{\var{x}}=\lVert \var{p}_{\var{xz}}\rVert-\var{R}`,
        String.raw`\var{d}_{\var{y}}=|\var{p}_{\var{y}}|-\var{H}`,
      ]],
      [String.raw`\var{p}=\big(`, [
        String.raw`\var{p}_{\var{x}}=-\var{r}\cos \var{M}`,
        String.raw`\var{p}_{\var{y}}=0`,
        String.raw`\var{p}_{\var{z}}=\var{r}\sin \var{M}`,
      ]],
      ['23.43928', [
        String.raw`\var{x}_{\fn{eq}}=\var{x}_{\fn{ecl}}`,
      ]],
    ];
    blocks = blocks.flatMap(b => {
      const rw = REWRITES.find(([key]) => b.includes(key));
      return rw ? rw[1].map(l => `$$ ${l} $$`) : [b];
    });
  }
  blocks = blocks.filter(b => isRule(b)
    || (b.replace(/\s+/g, '').length <= maxLen && symbolCount(b) <= maxSymbols
        && !drop.some(key => b.includes(key))));
  const out = [];
  for (const b of blocks) {
    if (isRule(b) && (!out.length || isRule(out[out.length - 1]))) continue;
    out.push(b);
  }
  while (out.length && isRule(out[out.length - 1])) out.pop();
  return out.join('\n\n');
}
const EPHEMERIS_RING_MATH = ephemerisMathBlocks();
// Short set: one clause per line, capped just below the Julian Day formula —
// "the JD line and anything as long or longer" is out.
const JD_LEN = EPHEMERIS_RING.split('\n\n')
  .filter(b => b.includes('\\fn{JD}='))
  .map(b => b.replace(/\s+/g, '').length)[0] || 122;
const EPHEMERIS_RING_SHORT = ephemerisMathBlocks({ maxLen: JD_LEN - 1, splitClauses: true });
// Very short set: additionally capped at 8 visible symbols per line, minus
// a few explicit evictions.
const EPHEMERIS_RING_VERY_SHORT = ephemerisMathBlocks({
  maxLen: JD_LEN - 1, splitClauses: true, maxSymbols: 8,
  drop: [
    '2451545',                    // the T = (JD − 2451545.0)/36525 fraction
    String.raw`\var{e}^{\!*}`,    // the degree-form M = E − e* sin E
  ],
});

const LATEX_PRESETS = {
  combination: COMBINATION_OPERATORS,
  primitives: PRIMITIVES,
  xtorus: XTORUS,
  snowflake: SNOWFLAKE,
  snowflakeGuide: SNOWFLAKE_GUIDE,
  ephemerisRing: EPHEMERIS_RING,
  ephemerisRingMath: EPHEMERIS_RING_MATH,
  ephemerisRingShort: EPHEMERIS_RING_SHORT,
  ephemerisRingVeryShort: EPHEMERIS_RING_VERY_SHORT,
  sdf: [COMBINATION_OPERATORS, PRIMITIVES, XTORUS].join('\n\n'),
};

export function initLatexAnimator() {
  // ---- Elements ----
  const input = document.getElementById('latexInput');
  const preset = document.getElementById('latexPreset');
  const display = document.getElementById('latexDisplay');
  const stage = document.getElementById('latexStage');

  const fontSel = document.getElementById('latexFont');
  const fontSize = document.getElementById('latexFontSize');
  const displayHeight = document.getElementById('latexDisplayHeight');
  const displayPadding = document.getElementById('latexDisplayPadding');
  const themeSel = document.getElementById('latexTheme');
  const alignSel = document.getElementById('latexAlign');
  const lineHeight = document.getElementById('latexLineHeight');
  const typingEffect = document.getElementById('latexTypingEffect');
  const speed = document.getElementById('latexSpeed');
  const charsPerTick = document.getElementById('latexCharsPerTick');
  const cursorOpt = document.getElementById('latexCursor');
  const cursorBlink = document.getElementById('latexCursorBlink');

  const startBtn = document.getElementById('latexStartBtn');
  const resetBtn = document.getElementById('latexResetBtn');
  const pauseBtn = document.getElementById('latexPauseBtn');
  const instantBtn = document.getElementById('latexInstantBtn');
  const unitCount = document.getElementById('latexUnitCount');

  // ---- State ----
  let units = [];        // all drawable glyph elements, document order
  let events = [];       // ordered reveal events (each = array of elements)
  let eventIndex = 0;    // next event to reveal
  let revealed = 0;      // glyph count revealed (for stats)
  let animationId = null;
  let isPaused = false;
  let mathReady = false;
  let rendering = false;
  let floatState = null;    // live float-mode run: { layer, units, eqs, p, st, paused, raf }
  let particleState = null; // live particle-mode run: { canvas, ctx, engine, raf, last, paused }
  let particleGen = 0;      // bumping this aborts an in-flight particle sampling pass
  let cinemaState = null;   // live zoom/cell run: { canvas, ctx, sim, raf, last, paused }
  let cinemaGen = 0;        // bumping this aborts an in-flight sprite build

  const zoomControls = document.getElementById('latexZoomControls');
  const zoomCount = document.getElementById('latexZoomCount');
  const zoomTravel = document.getElementById('latexZoomTravel');
  const zoomTilt = document.getElementById('latexZoomTilt');
  const zoomDepth = document.getElementById('latexZoomDepth');
  const zoomPersp = document.getElementById('latexZoomPersp');
  const zoomBlur = document.getElementById('latexZoomBlur');
  const zoomDiagrams = document.getElementById('latexZoomDiagrams');
  const cellControls = document.getElementById('latexCellControls');
  const cellCount = document.getElementById('latexCellCount');
  const cellFlow = document.getElementById('latexCellFlow');
  const cellTilt = document.getElementById('latexCellTilt');
  const cellBlur = document.getElementById('latexCellBlur');

  const particleControls = document.getElementById('latexParticleControls');
  const partCount = document.getElementById('latexPartCount');
  const partSize = document.getElementById('latexPartSize');
  const partGlow = document.getElementById('latexPartGlow');
  const partBlend = document.getElementById('latexPartBlend');
  const partMorph = document.getElementById('latexPartMorph');
  const partHold = document.getElementById('latexPartHold');
  const partScatter = document.getElementById('latexPartScatter');
  const partIdle = document.getElementById('latexPartIdle');
  const partCymScale = document.getElementById('latexPartCymScale');
  const partCymSize = document.getElementById('latexPartCymSize');
  const partNoise = document.getElementById('latexPartNoise');
  const partLines = document.getElementById('latexPartLines');
  const partPlace = document.getElementById('latexPartPlace');
  const partRelicMode = document.getElementById('latexPartRelicMode');

  const renderSize = document.getElementById('latexRenderSize');
  const floatControls = document.getElementById('latexFloatControls');
  const floatCount = document.getElementById('latexFloatCount');
  const floatLife = document.getElementById('latexFloatLife');
  const floatZoom = document.getElementById('latexFloatZoom');
  const floatFade = document.getElementById('latexFloatFade');
  const floatFadeIn = document.getElementById('latexFloatFadeIn');
  const floatLayout = document.getElementById('latexFloatLayout');
  const floatReveal = document.getElementById('latexFloatReveal');

  const FONT_MODES = {
    editorial: 'font-editorial',
    'editorial-ultralight': 'font-editorial-ultralight',
    serifmono: 'font-serifmono',
    default: 'font-default',
  };

  // Caret element lives inside the stage
  const caret = document.createElement('span');
  caret.className = 'latex-caret';
  stage.appendChild(caret);

  // ---- Styling (live, no re-typeset) ----
  function applyStyles() {
    const theme = themeSel.value;
    const fontMode = FONT_MODES[fontSel.value] || 'font-editorial';
    const align = { left: ' align-left', right: ' align-right' }[alignSel.value] || '';
    display.className = `code-display latex-display theme-${theme} ${fontMode}${align}`
      + ((floatState || particleState || cinemaState) ? ' latex-float-on' : '');
    if (particleState) particleState.engine.setColor(getComputedStyle(display).color);
    display.style.height = displayHeight.value + 'px';
    display.style.padding = displayPadding.value + 'px';
    // Live preview matches the render aspect: height from the slider, width
    // from the Render Size ratio (overrides .code-display's width:100%).
    const [rw, rh] = renderSize.value.split('x').map(Number);
    display.style.aspectRatio = `${rw} / ${rh}`;
    display.style.width = 'auto';
    display.style.maxWidth = '100%';
    display.style.margin = '0 auto';
    display.style.alignSelf = 'center';
    stage.style.fontSize = fontSize.value + 'px';
    stage.style.setProperty('--lx-gap', (lineHeight.value / 100) + 'em');
    caret.classList.toggle('blink', cursorBlink.checked);
  }

  // ---- Render: typeset the LaTeX, collect glyph units, reset to hidden ----
  async function render() {
    if (!mathReady || rendering) return;
    rendering = true;
    stopAnimation();

    // Font mode must be applied BEFORE typeset so \text is measured in the right font.
    applyStyles();

    stage.querySelectorAll('mjx-container').forEach(c => c.remove());
    const holder = document.createElement('div');
    holder.textContent = input.value;
    stage.insertBefore(holder, caret);

    try {
      window.MathJax.typesetClear([stage]);
      // Kick off typesetting, but don't block on its promise — MathJax keeps the
      // promise pending through speech/menu enrichment, which can lag well after
      // the visual SVG is already in the DOM. Poll for the rendered glyphs instead.
      window.MathJax.typesetPromise([stage]).catch(() => {});
      const glyphSel = 'mjx-container svg path, mjx-container svg use, mjx-container svg rect, mjx-container svg text';
      for (let i = 0; i < 160; i++) {
        if (stage.querySelectorAll(glyphSel).length) break;
        await new Promise(r => setTimeout(r, 25));
      }
    } catch {
      // typeset failed (bad LaTeX) — leave raw text visible
    }

    collectUnits();
    buildEvents();
    resetReveal();
    rendering = false;
  }

  function collectUnits() {
    units = [];
    stage.querySelectorAll('mjx-container svg').forEach(svg => {
      svg.querySelectorAll('path, rect, text, image, use').forEach(el => {
        if (el.closest('defs')) return;
        units.push(el);
      });
    });
  }

  // ---- Reveal ordering ----
  function ancestorToken(el) {
    let n = el.parentNode;
    while (n && n.nodeType === 1) {
      const t = n.getAttribute && n.getAttribute('data-mml-node');
      if (t && TOKEN_NODES.has(t)) return n;
      n = n.parentNode;
    }
    return el;
  }

  function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  function groupConsecutive(keyFn) {
    const groups = [];
    let cur = null, curKey = null;
    for (const u of units) {
      const k = keyFn(u);
      if (k !== curKey) { cur = []; groups.push(cur); curKey = k; }
      cur.push(u);
    }
    return groups;
  }

  function buildEvents() {
    const mode = typingEffect.value;
    const per = parseInt(charsPerTick.value) || 1;

    if (mode === 'token') {
      events = groupConsecutive(u => ancestorToken(u));
      return;
    }
    if (mode === 'line') {
      events = groupConsecutive(u => u.closest('mjx-container'));
      return;
    }

    let order = units.slice();
    if (mode === 'random') {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    } else if (mode === 'reverse') {
      order.reverse();
    } else if (mode === 'middle-out') {
      const n = order.length, mid = Math.floor(n / 2), seq = [];
      let l = mid - 1, r = mid;
      while (l >= 0 || r < n) {
        if (r < n) seq.push(order[r++]);
        if (l >= 0) seq.push(order[l--]);
      }
      order = seq;
    }
    events = chunk(order, per);
  }

  function resetReveal() {
    units.forEach(u => u.classList.add('lx-hidden'));
    eventIndex = 0;
    revealed = 0;
    stage.scrollTop = 0;
    updateCaret(null);
    updateStats();
  }

  function revealAll() {
    units.forEach(u => u.classList.remove('lx-hidden'));
    eventIndex = events.length;
    revealed = units.length;
    updateCaret(units[units.length - 1] || null);
    updateStats();
  }

  // ---- Caret ----
  function updateCaret(lastEl) {
    if (!lastEl) { caret.classList.remove('visible'); return; }
    try {
      const sr = stage.getBoundingClientRect();
      const r = lastEl.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) { caret.classList.remove('visible'); return; }
      const h = Math.max(r.height, parseFloat(fontSize.value));
      const top = r.top - sr.top + stage.scrollTop;
      // Follow the reveal: keep the current glyph inside the viewport so
      // presets taller than the display don't type off-screen.
      const pad = h * 1.5;
      if (top < stage.scrollTop + pad) {
        stage.scrollTop = Math.max(0, top - pad);
      } else if (top + h > stage.scrollTop + stage.clientHeight - pad) {
        stage.scrollTop = top + h - stage.clientHeight + pad;
      }
      if (!cursorOpt.checked) { caret.classList.remove('visible'); return; }
      caret.style.left = (r.right - sr.left + stage.scrollLeft) + 'px';
      caret.style.top = top + 'px';
      caret.style.height = h + 'px';
      caret.classList.add('visible');
    } catch {
      caret.classList.remove('visible');
    }
  }

  function updateStats() {
    unitCount.textContent = `${revealed} / ${units.length} glyphs`;
  }

  // ---- Float mode ("calculating math" meme) ----
  // Whole equations fade in, zoom toward the camera, and fade back out past
  // a threshold — continuously, respawning as they die. Placement follows
  // the Float Layout:
  //   random   — anywhere on the canvas (full bleed)
  //   cascade  — centered, marching down slot by slot, wrapping at the
  //              bottom; equations cycle in document order
  //   symmetry — quartets: one grid-snapped position mirrored across both
  //              axes, all four born/dying together
  function floatParams() {
    return {
      count: parseInt(floatCount.value),
      life: parseInt(floatLife.value) * 100,   // slider 15–80 → 1.5–8s
      zoom: parseInt(floatZoom.value) / 10,    // slider 15–60 → ×1.5–6
      fadeAt: parseInt(floatFade.value) / 100,   // life fraction where fade-out starts
      fadeIn: parseInt(floatFadeIn.value) / 100, // life fraction spent fading/cascading in
      layout: floatLayout.value,
      reveal: floatReveal.value, // glyph-cascade fade-in direction, or 'off'
      gap: parseInt(lineHeight.value) / 100, // Line Spacing, in em
      fontSizePx: parseInt(fontSize.value),
    };
  }

  const FLOAT_FADE_IN = 0.18; // fallback fade-in fraction (Fade In slider overrides)

  // Glyph order for the cascade reveal. Document order is reading order in
  // MathJax's SVG output, so it doubles as left → right.
  function floatOrderGlyphs(el, mode) {
    const gs = [...el.querySelectorAll('svg path, svg rect, svg text, svg use')]
      .filter(g => !g.closest('defs'));
    if (mode === 'rtl') gs.reverse();
    else if (mode === 'center') {
      const out = [], mid = Math.floor(gs.length / 2);
      let l = mid - 1, r = mid;
      while (l >= 0 || r < gs.length) {
        if (r < gs.length) out.push(gs[r++]);
        if (l >= 0) out.push(gs[l--]);
      }
      return out;
    } else if (mode === 'random') {
      for (let i = gs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [gs[i], gs[j]] = [gs[j], gs[i]];
      }
    }
    return gs;
  }

  // Blocks worth floating: anything with real glyphs (skips bare \rule
  // dividers). Multi-line blocks (aligned environments) are split so each
  // LINE floats on its own; fenced tables (matrices) are one semantic
  // object and stay whole.
  function floatEquations() {
    const out = [];
    for (const c of stage.querySelectorAll('mjx-container')) {
      if (c.querySelectorAll('path, use, text').length < 1) continue;
      out.push(...splitFloatLines(c));
    }
    return out;
  }

  // Per-line clones of a multi-row container: the clone's SVG viewBox is
  // cropped to one row's box, and explicit px width/height pin its size
  // (an off-DOM clone has no layout — the recorder reads data-lx-w/h).
  function splitFloatLines(container) {
    const svg = container.querySelector('svg');
    const mtable = svg && svg.querySelector('g[data-mml-node="mtable"]');
    if (!mtable) return [container];
    const rows = [...mtable.querySelectorAll('g[data-mml-node="mtr"], g[data-mml-node="mlabeledtr"]')];
    if (rows.length < 2) return [container];
    const fenced = [...mtable.parentElement.children].some(sib =>
      sib !== mtable && sib.getAttribute && sib.getAttribute('data-mml-node') === 'mo');
    if (fenced) return [container];

    const svgRect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    if (!svgRect.width || !svgRect.height || !vb.height) return [container];
    const u = vb.height / svgRect.height; // css px → svg user units
    const PAD = 3;                        // css px, so glyph edges don't clip
    return rows.map(row => {
      const r = row.getBoundingClientRect();
      const w = r.width + 2 * PAD;
      const h = r.height + 2 * PAD;
      const clone = container.cloneNode(true);
      const cs = clone.querySelector('svg');
      cs.setAttribute('viewBox',
        `${vb.x + (r.left - svgRect.left - PAD) * u} ${vb.y + (r.top - svgRect.top - PAD) * u} ${w * u} ${h * u}`);
      cs.setAttribute('width', w + 'px');
      cs.setAttribute('height', h + 'px');
      // MathJax's stylesheet makes these svgs overflow:visible, which would
      // defeat this row crop and leak the block's other lines into the
      // clone — the crop needs a real clip. (The row's own rect is measured
      // from actual ink, so nothing of THIS line is lost.)
      cs.style.overflow = 'hidden';
      clone.dataset.lxW = w.toFixed(2);
      clone.dataset.lxH = h.toFixed(2);
      return clone;
    });
  }

  const FLOAT_GRID = 8; // symmetry mode: centers snap to an 8×8 grid

  // Shuffled-bag draw: cycles the whole pool before any equation repeats,
  // so symmetric quartets (and the screen) never show duplicates.
  function floatDraw(eqs, st) {
    if (!st.bag || !st.bag.length) {
      st.bag = eqs.map((_, i) => i);
      for (let i = st.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [st.bag[i], st.bag[j]] = [st.bag[j], st.bag[i]];
      }
    }
    return eqs[st.bag.pop()];
  }

  // Best-candidate (blue-noise) sampling for random layout: try several
  // random spots and keep the one farthest from every live equation, so new
  // spawns land in the emptiest region instead of on top of a neighbor.
  // Vertical distance is weighted up because equations are wide and flat —
  // y-separation is what actually prevents visual overlap.
  function floatBestSpot(existing) {
    let best = null, bestScore = -1;
    for (let c = 0; c < 14; c++) {
      const x = Math.random() * 100, y = Math.random() * 100;
      let score = Infinity;
      for (const [ex, ey] of existing) {
        const dx = x - ex, dy = (y - ey) * 2.5;
        score = Math.min(score, dx * dx + dy * dy);
      }
      if (score > bestScore) { bestScore = score; best = [x, y]; }
    }
    return best;
  }

  const SPIRAL_DTH = 0.85;   // rad between consecutive spiral slots
  const SPIRAL_R0 = 8;       // innermost slot radius, % of half-extent
  const SPIRAL_R1 = 44;      // outermost slot radius
  const SPIRAL_SWIRL = 1.2;  // rad of entry swirl during fade-in

  // A unit is 1 element (random/cascade/spiral) or 4 mirrored elements
  // (symmetry, each showing a different equation).
  function floatPlace(unit, eqs, p, born, st) {
    let eq = null, positions;
    unit.spiral = null;
    if (p.layout === 'cascade') {
      eq = eqs[st.eqIndex++ % eqs.length];
      positions = [[50, st.y0 + (st.slot++ % st.slots) * st.stepPct]];
    } else if (p.layout === 'spiral') {
      eq = eqs[st.eqIndex++ % eqs.length];
      const k = st.slot++ % st.slots;
      const ang = k * SPIRAL_DTH - Math.PI / 2; // wind outward from the top
      const rad = SPIRAL_R0 + (SPIRAL_R1 - SPIRAL_R0) * (st.slots <= 1 ? 0 : k / (st.slots - 1));
      unit.spiral = { ang, rad };
      unit.spiralSettled = false;
      positions = [[50 + rad * Math.cos(ang), 50 + rad * Math.sin(ang)]];
    } else if (p.layout === 'symmetry') {
      const x = (Math.floor(Math.random() * (FLOAT_GRID / 2)) + 0.5) / FLOAT_GRID * 100;
      const y = (Math.floor(Math.random() * (FLOAT_GRID / 2)) + 0.5) / FLOAT_GRID * 100;
      positions = [[x, y], [100 - x, y], [x, 100 - y], [100 - x, 100 - y]];
    } else {
      eq = eqs[Math.floor(Math.random() * eqs.length)];
      const others = (st.units || []).filter(u => u !== unit).flatMap(u => u.pos || []);
      positions = [floatBestSpot(others)];
    }
    unit.pos = positions;
    unit.els.forEach((el, k) => {
      el.replaceChildren((eq || floatDraw(eqs, st)).cloneNode(true));
      el.style.left = positions[k][0] + '%';
      el.style.top = positions[k][1] + '%';
      el.style.opacity = '0';
    });
    // Glyph-cascade reveal: start every glyph transparent (opacity, not
    // visibility — the layer's .lx-hidden override uses visibility) and
    // reveal them in order during the fade-in window.
    if (p.reveal !== 'off') {
      unit.glyphSets = unit.els.map(el => {
        const gs = floatOrderGlyphs(el, p.reveal);
        gs.forEach(g => { g.style.opacity = '0'; });
        return gs;
      });
      unit.revealed = unit.glyphSets.map(() => 0);
    } else {
      unit.glyphSets = null;
    }
    unit.born = born;
    // Cascade/spiral keep uniform lifetimes so respawn order (the ladder /
    // the winding) never scrambles; the other layouts jitter ±25%.
    unit.life = (p.layout === 'cascade' || p.layout === 'spiral')
      ? p.life : p.life * (0.75 + Math.random() * 0.5);
  }

  function floatFrame(now) {
    if (!floatState) return;
    const { units, eqs, p, st } = floatState;
    if (!floatState.paused) {
      for (const u of units) {
        let t = (now - u.born) / u.life;
        if (t >= 1) { floatPlace(u, eqs, p, now, st); t = 0; }
        if (t < 0) continue; // staggered birth still pending
        // Born at 1/zoom of natural size, growing to exactly natural size —
        // total growth is ×zoom, and nothing ever scales past its raster.
        const s = 1 / p.zoom + (1 - 1 / p.zoom) * Math.pow(t, 1.6);
        // With the glyph cascade on, the cascade IS the entrance — the item
        // itself starts opaque and only the fade-out curve applies.
        if (u.glyphSets) {
          const frac = Math.min(1, t / (p.fadeIn || FLOAT_FADE_IN));
          u.glyphSets.forEach((gs, gi) => {
            const target = Math.floor(gs.length * frac);
            while (u.revealed[gi] < target) gs[u.revealed[gi]++].style.opacity = '1';
          });
        }
        const fadeOut = t <= p.fadeAt ? 1 : 1 - (t - p.fadeAt) / (1 - p.fadeAt);
        const alpha = Math.max(0, u.glyphSets
          ? Math.min(1, fadeOut)
          : Math.min(Math.min(1, t / (p.fadeIn || FLOAT_FADE_IN)), fadeOut));
        const op = alpha.toFixed(3);
        const tf = `translate(-50%,-50%) scale(${s.toFixed(4)})`;
        const z = Math.round(s * 100); // closer = on top
        for (const el of u.els) {
          el.style.opacity = op;
          el.style.transform = tf;
          el.style.zIndex = z;
        }
        // spiral entry: glide along the winding (angle unwinds, radius
        // grows) over the fade-in, then settle exactly on the slot
        if (u.spiral && !u.spiralSettled) {
          const fi = Math.min(1, t / (p.fadeIn || FLOAT_FADE_IN));
          const ang = u.spiral.ang - (1 - fi) * SPIRAL_SWIRL;
          const rad = u.spiral.rad * (0.5 + 0.5 * fi);
          const x = (50 + rad * Math.cos(ang)) + '%';
          const y = (50 + rad * Math.sin(ang)) + '%';
          for (const el of u.els) {
            el.style.left = x;
            el.style.top = y;
          }
          u.spiralSettled = fi >= 1;
        }
      }
    }
    floatState.raf = requestAnimationFrame(floatFrame);
  }

  function startFloat() {
    stopAnimation(); // clears any reveal run AND any previous float
    const eqs = floatEquations();
    if (!eqs.length) return;
    const p = floatParams();
    const layer = document.createElement('div');
    layer.className = 'latex-float-layer';
    layer.style.fontSize = fontSize.value + 'px'; // stage carries size; display carries font/color
    display.appendChild(layer);
    const per = p.layout === 'symmetry' ? 4 : 1;
    const nUnits = Math.max(1, Math.round(p.count / per));
    const st = { slot: 0, slots: nUnits, eqIndex: 0 };
    if (p.layout === 'cascade') {
      // The ladder's vertical step follows the flowed-text rhythm: median
      // equation height + the Line Spacing gap. Slots = how many such lines
      // fit; the ladder is centered and wraps after the last slot.
      const hs = eqs.map(eq => eq.dataset.lxH ? parseFloat(eq.dataset.lxH)
        : eq.getBoundingClientRect().height).filter(Boolean).sort((a, b) => a - b);
      const lineH = hs.length ? hs[Math.floor(hs.length / 2)] : p.fontSizePx * 1.5;
      const stepPx = lineH + p.gap * p.fontSizePx;
      st.stepPct = stepPx / (display.clientHeight || 1) * 100;
      st.slots = Math.max(1, Math.floor(96 / st.stepPct));
      st.y0 = (100 - (st.slots - 1) * st.stepPct) / 2;
    }
    const now = performance.now();
    const units = [];
    st.units = units; // grows during the loop, so early spawns repel later ones
    for (let i = 0; i < nUnits; i++) {
      const els = [];
      for (let k = 0; k < per; k++) {
        const el = document.createElement('div');
        el.className = 'latex-float-item';
        layer.appendChild(el);
        els.push(el);
      }
      const unit = { els, born: 0, life: 0 };
      floatPlace(unit, eqs, p, now + i * (p.life / nUnits), st); // stagger births over one lifetime
      units.push(unit);
    }
    floatState = { layer, units, eqs, p, st, paused: false, raf: 0 };
    applyStyles(); // picks up latex-float-on
    floatState.raf = requestAnimationFrame(floatFrame);
  }

  function stopFloat() {
    if (!floatState) return;
    cancelAnimationFrame(floatState.raf);
    floatState.layer.remove();
    floatState = null;
    applyStyles();
    isPaused = false;
    pauseBtn.textContent = 'Pause';
  }

  // ---- Particle mode ("morphing glyphs") ----
  // A fixed pool of fine particles forms one line's glyphs, holds, then
  // morphs into the next line — cycling through every line of the input.
  function particleParams() {
    return {
      count: parseInt(partCount.value),
      sizePx: parseInt(partSize.value) / 10,   // slider 5–60 → 0.5–6px
      glow: parseInt(partGlow.value) / 100,
      blend: partBlend.value,
      morphMs: parseInt(partMorph.value),
      holdMs: parseInt(partHold.value),
      scatter: parseInt(partScatter.value),    // cymatic drive during morphs
      idle: parseInt(partIdle.value),          // cymatic drive while holding
      cymScale: parseInt(partCymScale.value),  // nodal wavelength, px
      cymSize: parseInt(partCymSize.value),    // pattern spread radius, px
      noise: partNoise.value,                  // symmetric field family
      linesPer: parseInt(partLines.value),     // lines shown per transition
      place: partPlace.value,                  // 'center' | 'random'
      relicMode: partRelicMode.value,          // 'off' | 'stop' | 'guide'
    };
  }

  // Randomized relic-ring forms (ported SDF family) for the interludes
  // between lines. A pool is carved up front; the engine picks from it.
  function relicFormRow() {
    return {
      radiusPx: Math.min(display.clientWidth, display.clientHeight) * 0.42,
      rowWidthPx: display.clientWidth * 0.86,
    };
  }

  function particleArea() {
    return {
      w: display.clientWidth,
      h: display.clientHeight,
      lineGap: (parseInt(lineHeight.value) / 100) * parseInt(fontSize.value),
    };
  }

  async function buildRelicForms(maxPoints, onProgress) {
    if (partRelicMode.value === 'off') return [];
    const radiusPx = relicFormRow().radiusPx;
    const POOL = 8;
    const forms = [];
    for (let i = 0; i < POOL; i++) {
      if (onProgress) onProgress(i + 1, POOL);
      await new Promise(r => setTimeout(r, 0)); // let the label paint
      forms.push(sampleRelicForm({ radiusPx, maxPoints }));
    }
    return forms;
  }

  // Rasterize every float-eligible line into particle-target point sets.
  // Reuses the recorder's inlined font CSS so \text runs render in-raster.
  async function buildParticleLines(maxPoints, onProgress) {
    await recorder._ensureFonts();
    const ss = getComputedStyle(stage);
    const eqs = floatEquations();
    const lines = [];
    for (let i = 0; i < eqs.length; i++) {
      const eq = eqs[i];
      const svgEl = eq.querySelector('svg');
      if (!svgEl) continue;
      const r = svgEl.getBoundingClientRect();
      const w = Math.ceil(eq.dataset.lxW ? parseFloat(eq.dataset.lxW) : r.width);
      const h = Math.ceil(eq.dataset.lxH ? parseFloat(eq.dataset.lxH) : r.height);
      if (!w || !h) continue;
      try {
        const line = await sampleLinePoints(eq, {
          fontFamily: ss.fontFamily, fontSize: ss.fontSize,
          width: w, height: h, fontCss: recorder._fontCss, maxPoints,
        });
        if (line) { line.w = w; line.h = h; lines.push(line); }
      } catch { /* one bad line shouldn't sink the run */ }
      if (onProgress) onProgress(i + 1, eqs.length);
    }
    return lines;
  }

  async function startParticles() {
    stopAnimation();
    const gen = ++particleGen;
    const pp = particleParams();
    const lines = await buildParticleLines(pp.count, (i, n) => {
      unitCount.textContent = `sampling ${i}/${n} lines`;
    });
    if (gen !== particleGen || !lines.length) { updateStats(); return; }
    const forms = await buildRelicForms(pp.count, (i, n) => {
      unitCount.textContent = `carving relic form ${i}/${n}`;
    });
    updateStats();
    if (gen !== particleGen) return; // aborted during carving

    const canvas = document.createElement('canvas');
    canvas.className = 'latex-particle-canvas';
    display.appendChild(canvas);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = display.clientWidth * dpr;
    canvas.height = display.clientHeight * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const engine = new LatexParticleEngine({
      lines, count: pp.count, params: pp,
      color: getComputedStyle(display).color,
      forms,
      formRow: relicFormRow(),
      area: particleArea(),
    });
    particleState = { canvas, ctx, engine, raf: 0, last: performance.now(), paused: false };
    applyStyles(); // hides the stage behind the canvas

    const frame = (now) => {
      if (!particleState) return;
      const dt = Math.min(100, now - particleState.last);
      particleState.last = now;
      if (!particleState.paused) {
        particleState.engine.step(dt);
        const w = display.clientWidth, h = display.clientHeight;
        particleState.ctx.clearRect(0, 0, w, h);
        particleState.engine.draw(particleState.ctx, w / 2, h / 2, 1);
      }
      particleState.raf = requestAnimationFrame(frame);
    };
    particleState.raf = requestAnimationFrame(frame);
  }

  function stopParticles() {
    particleGen++;
    if (!particleState) return;
    cancelAnimationFrame(particleState.raf);
    particleState.canvas.remove();
    particleState = null;
    applyStyles();
    isPaused = false;
    pauseBtn.textContent = 'Pause';
  }

  // ---- Cinematic modes: Zoom (fly-through) and Cell (living symbols) ----
  function zoomParams() {
    return {
      count: parseInt(zoomCount.value),
      travelMs: Math.round(parseFloat(zoomTravel.value) * 1000), // min 0.5s
      tiltDeg: parseInt(zoomTilt.value),
      depth: parseFloat(zoomDepth.value),      // continuous
      persp: parseFloat(zoomPersp.value) / 50, // 0 straight … 1 true … 2 wide
      blur: parseInt(zoomBlur.value),
    };
  }
  function cellParams() {
    return {
      cells: parseInt(cellCount.value),
      flowMs: parseInt(cellFlow.value) * 1000,
      tiltDeg: parseInt(cellTilt.value),
      blur: parseInt(cellBlur.value),
    };
  }

  function cinemaFontOpts() {
    const ss = getComputedStyle(stage);
    return {
      fontFamily: ss.fontFamily,
      fontSize: ss.fontSize,
      color: getComputedStyle(display).color,
      fontCss: recorder._fontCss,
    };
  }

  // Build the sim for the current cinematic mode (used live and by Record).
  async function buildCinemaSim(mode) {
    await recorder._ensureFonts();
    const area = { w: display.clientWidth, h: display.clientHeight };
    if (mode === 'zoom') {
      unitCount.textContent = 'rendering lines…';
      const opts = cinemaFontOpts();
      const sprites = await rasterizeLines(floatEquations(), opts);
      updateStats();
      if (!sprites.length) return null;
      // labeled diagrams: rare, time-gated, edge-hugging guests handled by
      // the sim itself (at most one spawn per few seconds)
      const diagrams = zoomDiagrams.checked ? await buildDiagramSprites(opts) : [];
      return new ZoomSim({ sprites, area, params: zoomParams(), diagrams });
    }
    unitCount.textContent = 'carving glyphs…';
    const sets = await buildGlyphSets(
      [...stage.querySelectorAll('mjx-container')], cinemaFontOpts());
    updateStats();
    if (!sets.length) return null;
    return new CellSim({ sets, area, params: cellParams() });
  }

  async function startCinema(mode) {
    stopAnimation();
    const gen = ++cinemaGen;
    const sim = await buildCinemaSim(mode);
    if (gen !== cinemaGen || !sim) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'latex-particle-canvas';
    display.appendChild(canvas);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = display.clientWidth * dpr;
    canvas.height = display.clientHeight * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    cinemaState = { canvas, ctx, sim, mode, raf: 0, last: performance.now(), paused: false };
    applyStyles(); // hides the stage behind the canvas
    const frame = (now) => {
      if (!cinemaState) return;
      const dt = Math.min(100, now - cinemaState.last);
      cinemaState.last = now;
      if (!cinemaState.paused) {
        cinemaState.sim.step(dt);
        const w = display.clientWidth, h = display.clientHeight;
        cinemaState.ctx.clearRect(0, 0, w, h);
        cinemaState.sim.draw(cinemaState.ctx, 1, 0, 0);
      }
      cinemaState.raf = requestAnimationFrame(frame);
    };
    cinemaState.raf = requestAnimationFrame(frame);
  }

  function stopCinema() {
    cinemaGen++;
    if (!cinemaState) return;
    cancelAnimationFrame(cinemaState.raf);
    cinemaState.canvas.remove();
    cinemaState = null;
    applyStyles();
    isPaused = false;
    pauseBtn.textContent = 'Pause';
  }

  // ---- Stepping ----
  function stepOnce() {
    if (eventIndex >= events.length) return { done: true, delay: 0 };
    const ev = events[eventIndex++];
    ev.forEach(el => el.classList.remove('lx-hidden'));
    revealed += ev.length;
    updateCaret(ev[ev.length - 1]);
    updateStats();

    let delay = parseInt(speed.value);
    if (typingEffect.value === 'natural') {
      const base = parseInt(speed.value);
      delay = base * (0.5 + Math.random() * 1.1);
      if (Math.random() < 0.08) delay = base * (2.5 + Math.random() * 2);
      delay = Math.round(delay);
    }
    return { done: eventIndex >= events.length, delay };
  }

  function animationStep() {
    if (isPaused) return;
    const { done, delay } = stepOnce();
    if (done) { stopAnimation(); return; }
    animationId = setTimeout(animationStep, delay);
  }

  function startAnimation() {
    if (!mathReady) return;
    if (typingEffect.value === 'float') { startFloat(); return; }
    if (typingEffect.value === 'particles') { startParticles(); return; }
    if (typingEffect.value === 'zoom' || typingEffect.value === 'cell') { startCinema(typingEffect.value); return; }
    stopAnimation();
    resetReveal();
    isPaused = false;
    pauseBtn.textContent = 'Pause';
    animationStep();
  }

  function stopAnimation() {
    if (animationId) { clearTimeout(animationId); animationId = null; }
    stopFloat();
    stopParticles();
    stopCinema();
  }

  function reset() {
    stopAnimation();
    isPaused = false;
    pauseBtn.textContent = 'Pause';
    resetReveal();
  }

  function togglePause() {
    if (cinemaState) {
      cinemaState.paused = !cinemaState.paused;
      pauseBtn.textContent = cinemaState.paused ? 'Resume' : 'Pause';
      return;
    }
    if (particleState) {
      particleState.paused = !particleState.paused;
      pauseBtn.textContent = particleState.paused ? 'Resume' : 'Pause';
      return;
    }
    if (floatState) {
      floatState.paused = !floatState.paused;
      if (floatState.paused) {
        floatState.pausedAt = performance.now();
      } else {
        const dt = performance.now() - floatState.pausedAt;
        floatState.units.forEach(u => { u.born += dt; });
      }
      pauseBtn.textContent = floatState.paused ? 'Resume' : 'Pause';
      return;
    }
    isPaused = !isPaused;
    pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    if (!isPaused && animationId === null && eventIndex < events.length) animationStep();
  }

  function instant() {
    stopAnimation();
    revealAll();
  }

  // ---- Scene save / load ----
  const saveBtn = document.getElementById('latexSaveSceneBtn');
  const loadBtn = document.getElementById('latexLoadSceneBtn');
  const sceneFile = document.getElementById('latexSceneFileInput');

  function saveScene() {
    const name = prompt('Scene name:');
    if (!name) return;
    const scene = {
      kind: 'latex-animator',
      name,
      latexInput: input.value,
      latexFont: fontSel.value,
      latexFontSize: fontSize.value,
      latexDisplayHeight: displayHeight.value,
      latexDisplayPadding: displayPadding.value,
      latexTheme: themeSel.value,
      latexAlign: alignSel.value,
      latexLineHeight: lineHeight.value,
      latexTypingEffect: typingEffect.value,
      latexSpeed: speed.value,
      latexCharsPerTick: charsPerTick.value,
      latexCursor: cursorOpt.checked,
      latexCursorBlink: cursorBlink.checked,
      latexFloatCount: floatCount.value,
      latexFloatLife: floatLife.value,
      latexFloatZoom: floatZoom.value,
      latexFloatFade: floatFade.value,
      latexFloatFadeIn: floatFadeIn.value,
      latexFloatLayout: floatLayout.value,
      latexFloatReveal: floatReveal.value,
      latexPartCount: partCount.value,
      latexPartSize: partSize.value,
      latexPartGlow: partGlow.value,
      latexPartBlend: partBlend.value,
      latexPartMorph: partMorph.value,
      latexPartHold: partHold.value,
      latexPartScatter: partScatter.value,
      latexPartIdle: partIdle.value,
      latexPartCymScale: partCymScale.value,
      latexPartCymSize: partCymSize.value,
      latexPartNoise: partNoise.value,
      latexPartLines: partLines.value,
      latexPartPlace: partPlace.value,
      latexPartRelicMode: partRelicMode.value,
      latexZoomCount: zoomCount.value,
      latexZoomTravel: zoomTravel.value,
      latexZoomTilt: zoomTilt.value,
      latexZoomDepth: zoomDepth.value,
      latexZoomPersp: zoomPersp.value,
      latexZoomBlur: zoomBlur.value,
      latexZoomDiagrams: zoomDiagrams.checked,
      latexCellCount: cellCount.value,
      latexCellFlow: cellFlow.value,
      latexCellTilt: cellTilt.value,
      latexCellBlur: cellBlur.value,
      latexRenderSize: renderSize.value
    };
    const blob = new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function loadScene(json) {
    try {
      const s = JSON.parse(json);
      if (s.latexInput !== undefined) { input.value = s.latexInput; preset.value = 'custom'; }
      if (s.latexFont !== undefined) fontSel.value = s.latexFont;
      if (s.latexFontSize !== undefined) { fontSize.value = s.latexFontSize; document.getElementById('latexFontSizeValue').textContent = s.latexFontSize + 'px'; }
      if (s.latexDisplayHeight !== undefined) { displayHeight.value = s.latexDisplayHeight; document.getElementById('latexDisplayHeightValue').textContent = s.latexDisplayHeight + 'px'; }
      if (s.latexDisplayPadding !== undefined) { displayPadding.value = s.latexDisplayPadding; document.getElementById('latexDisplayPaddingValue').textContent = s.latexDisplayPadding + 'px'; }
      if (s.latexTheme !== undefined) themeSel.value = s.latexTheme;
      if (s.latexAlign !== undefined) alignSel.value = s.latexAlign;
      if (s.latexLineHeight !== undefined) { lineHeight.value = s.latexLineHeight; document.getElementById('latexLineHeightValue').textContent = (s.latexLineHeight / 100) + 'em'; }
      if (s.latexTypingEffect !== undefined) typingEffect.value = s.latexTypingEffect;
      if (s.latexSpeed !== undefined) { speed.value = s.latexSpeed; document.getElementById('latexSpeedValue').textContent = s.latexSpeed + 'ms'; }
      if (s.latexCharsPerTick !== undefined) { charsPerTick.value = s.latexCharsPerTick; document.getElementById('latexCharsPerTickValue').textContent = s.latexCharsPerTick; }
      if (s.latexCursor !== undefined) cursorOpt.checked = s.latexCursor;
      if (s.latexCursorBlink !== undefined) cursorBlink.checked = s.latexCursorBlink;
      if (s.latexFloatCount !== undefined) { floatCount.value = s.latexFloatCount; document.getElementById('latexFloatCountValue').textContent = s.latexFloatCount; }
      if (s.latexFloatLife !== undefined) { floatLife.value = s.latexFloatLife; document.getElementById('latexFloatLifeValue').textContent = (parseInt(s.latexFloatLife) / 10).toFixed(1) + 's'; }
      if (s.latexFloatZoom !== undefined) { floatZoom.value = s.latexFloatZoom; document.getElementById('latexFloatZoomValue').textContent = '×' + (parseInt(s.latexFloatZoom) / 10).toFixed(1); }
      if (s.latexFloatFade !== undefined) { floatFade.value = s.latexFloatFade; document.getElementById('latexFloatFadeValue').textContent = s.latexFloatFade + '%'; }
      if (s.latexFloatFadeIn !== undefined) { floatFadeIn.value = s.latexFloatFadeIn; document.getElementById('latexFloatFadeInValue').textContent = s.latexFloatFadeIn + '%'; }
      if (s.latexFloatLayout !== undefined) floatLayout.value = s.latexFloatLayout;
      if (s.latexFloatReveal !== undefined) floatReveal.value = s.latexFloatReveal;
      if (s.latexPartCount !== undefined) { partCount.value = s.latexPartCount; document.getElementById('latexPartCountValue').textContent = s.latexPartCount; }
      if (s.latexPartSize !== undefined) { partSize.value = s.latexPartSize; document.getElementById('latexPartSizeValue').textContent = (parseInt(s.latexPartSize) / 10) + 'px'; }
      if (s.latexPartGlow !== undefined) { partGlow.value = s.latexPartGlow; document.getElementById('latexPartGlowValue').textContent = s.latexPartGlow + '%'; }
      if (s.latexPartBlend !== undefined) partBlend.value = s.latexPartBlend;
      if (s.latexPartMorph !== undefined) { partMorph.value = s.latexPartMorph; document.getElementById('latexPartMorphValue').textContent = s.latexPartMorph + 'ms'; }
      if (s.latexPartHold !== undefined) { partHold.value = s.latexPartHold; document.getElementById('latexPartHoldValue').textContent = s.latexPartHold + 'ms'; }
      if (s.latexPartScatter !== undefined) { partScatter.value = s.latexPartScatter; document.getElementById('latexPartScatterValue').textContent = s.latexPartScatter; }
      if (s.latexPartIdle !== undefined) { partIdle.value = s.latexPartIdle; document.getElementById('latexPartIdleValue').textContent = s.latexPartIdle; }
      if (s.latexPartCymScale !== undefined) { partCymScale.value = s.latexPartCymScale; document.getElementById('latexPartCymScaleValue').textContent = s.latexPartCymScale + 'px'; }
      if (s.latexPartCymSize !== undefined) { partCymSize.value = s.latexPartCymSize; document.getElementById('latexPartCymSizeValue').textContent = s.latexPartCymSize + 'px'; }
      if (s.latexPartNoise !== undefined) partNoise.value = s.latexPartNoise;
      if (s.latexPartLines !== undefined) { partLines.value = s.latexPartLines; document.getElementById('latexPartLinesValue').textContent = s.latexPartLines; }
      if (s.latexPartPlace !== undefined) partPlace.value = s.latexPartPlace;
      if (s.latexPartRelic !== undefined) partRelicMode.value = s.latexPartRelic ? 'stop' : 'off'; // legacy scenes
      if (s.latexPartRelicMode !== undefined) partRelicMode.value = s.latexPartRelicMode;
      for (const [key, el, suffix] of [
        ['latexZoomCount', zoomCount, ''], ['latexZoomTravel', zoomTravel, 's'],
        ['latexZoomTilt', zoomTilt, '°'], ['latexZoomDepth', zoomDepth, ''],
        ['latexZoomPersp', zoomPersp, ''],
        ['latexZoomBlur', zoomBlur, ''],
        ['latexCellCount', cellCount, ''], ['latexCellFlow', cellFlow, 's'],
        ['latexCellTilt', cellTilt, '°'], ['latexCellBlur', cellBlur, ''],
      ]) {
        if (s[key] !== undefined) { el.value = s[key]; document.getElementById(el.id + 'Value').textContent = s[key] + suffix; }
      }
      if (s.latexZoomDiagrams !== undefined) zoomDiagrams.checked = s.latexZoomDiagrams;
      if (s.latexRenderSize !== undefined) renderSize.value = s.latexRenderSize;
      syncFloatControls();
      render();
    } catch { /* invalid scene */ }
  }

  saveBtn.addEventListener('click', saveScene);
  loadBtn.addEventListener('click', () => sceneFile.click());
  sceneFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => loadScene(ev.target.result);
    reader.readAsText(file);
    sceneFile.value = '';
  });

  // ---- Recorder ----
  const recordBtn = document.getElementById('latexRecordBtn');
  const screenshotBtn = document.getElementById('latexScreenshotBtn');
  const recordStatus = document.getElementById('latexRecordStatus');
  const recorder = new LatexAnimatorRecorder();

  // Video/screenshot canvas size follows the Render Size select (e.g. 4:5
  // portrait for social). The content-sized Capture 4K/Pages are unaffected.
  function applyRenderSize() {
    const [w, h] = renderSize.value.split('x').map(Number);
    recorder.width = w;
    recorder.height = h;
  }
  // Scripting hook: lets the console / automation drive captures with
  // non-default options (e.g. custom width) without going through the buttons.
  window.__latexAnimator = { recorder, display, stage };

  recordBtn.addEventListener('click', async () => {
    if (!mathReady) return;
    recordBtn.disabled = true;
    recordStatus.textContent = 'Preparing...';
    applyRenderSize();
    stopAnimation();
    resetReveal();
    try {
      if (typingEffect.value === 'zoom' || typingEffect.value === 'cell') {
        const mode = typingEffect.value;
        recordStatus.textContent = 'Preparing...';
        const sim = await buildCinemaSim(mode);
        if (!sim) throw new Error('Nothing to render');
        const seconds = mode === 'zoom'
          ? Math.min(30, (zoomParams().travelMs * 2) / 1000)
          : Math.min(40, (sim.cycleMs() * 2) / 1000);
        await recorder.recordSim({
          display, sim, seconds,
          filename: `latex-${mode}.mp4`,
          onProgress: (p) => { recordStatus.textContent = `Recording... ${Math.round(p * 100)}%`; }
        });
        recordStatus.textContent = 'Done!';
        setTimeout(() => { recordStatus.textContent = ''; }, 3000);
        recordBtn.disabled = false;
        return;
      }
      if (typingEffect.value === 'particles') {
        const pp = particleParams();
        const lines = await buildParticleLines(pp.count, (i, n) => {
          recordStatus.textContent = `Sampling ${i}/${n} lines...`;
        });
        if (!lines.length) throw new Error('No lines to morph');
        const forms = await buildRelicForms(pp.count, (i, n) => {
          recordStatus.textContent = `Carving relic form ${i}/${n}...`;
        });
        const engine = new LatexParticleEngine({
          lines, count: pp.count, params: pp,
          color: getComputedStyle(display).color,
          forms,
          formRow: relicFormRow(),
          area: particleArea(),
        });
        const dispRect = display.getBoundingClientRect();
        await recorder.recordParticles({
          display,
          engine,
          scale: Math.min(recorder.width / dispRect.width, recorder.height / dispRect.height),
          onProgress: (p) => { recordStatus.textContent = `Recording... ${Math.round(p * 100)}%`; }
        });
        recordStatus.textContent = 'Done!';
        setTimeout(() => { recordStatus.textContent = ''; }, 3000);
        recordBtn.disabled = false;
        return;
      }
      if (typingEffect.value === 'float') {
        await recorder.recordFloat({
          display,
          stage,
          equations: floatEquations(),
          params: floatParams(),
          onProgress: (p) => { recordStatus.textContent = `Recording... ${Math.round(p * 100)}%`; }
        });
        recordStatus.textContent = 'Done!';
        setTimeout(() => { recordStatus.textContent = ''; }, 3000);
        recordBtn.disabled = false;
        return;
      }
      await recorder.record({
        display,
        stage,
        caret,
        totalUnits: events.length,
        stepReveal: stepOnce,
        cursorEnabled: cursorOpt.checked,
        onProgress: (p) => { recordStatus.textContent = `Recording... ${Math.round(p * 100)}%`; }
      });
      recordStatus.textContent = 'Done!';
    } catch (err) {
      recordStatus.textContent = 'Recording failed: ' + err.message;
    }
    setTimeout(() => { recordStatus.textContent = ''; }, 3000);
    recordBtn.disabled = false;
  });

  // Capture the finished animation — reveal everything, then rasterize that frame.
  screenshotBtn.addEventListener('click', async () => {
    if (!mathReady) return;
    screenshotBtn.disabled = true;
    recordStatus.textContent = 'Capturing...';
    applyRenderSize();
    stopAnimation();
    revealAll();
    try {
      await recorder.screenshot({ display, stage });
      recordStatus.textContent = 'Saved!';
    } catch (err) {
      recordStatus.textContent = 'Screenshot failed: ' + err.message;
    }
    setTimeout(() => { recordStatus.textContent = ''; }, 3000);
    screenshotBtn.disabled = false;
  });

  // Capture everything as one 4K-wide PNG (tall content = tall image).
  const captureBtn = document.getElementById('latexCaptureBtn');
  captureBtn.addEventListener('click', async () => {
    if (!mathReady) return;
    captureBtn.disabled = true;
    recordStatus.textContent = 'Capturing...';
    try {
      const name = `latex-${preset.value}-4k.png`;
      const { width, height } = await recorder.captureFull({ display, stage, filename: name });
      recordStatus.textContent = `Saved ${width}×${height}`;
    } catch (err) {
      recordStatus.textContent = 'Capture failed: ' + err.message;
    }
    setTimeout(() => { recordStatus.textContent = ''; }, 4000);
    captureBtn.disabled = false;
  });

  // Capture as numbered pages, each ≤4096 on both sides (Figma-safe).
  const pagesBtn = document.getElementById('latexPagesBtn');
  pagesBtn.addEventListener('click', async () => {
    if (!mathReady) return;
    pagesBtn.disabled = true;
    recordStatus.textContent = 'Capturing pages...';
    try {
      const base = `latex-${preset.value}`;
      const { pages, width } = await recorder.capturePages({ display, stage, base });
      recordStatus.textContent = `Saved ${pages} page${pages === 1 ? '' : 's'} (${width}×≤4096)`;
    } catch (err) {
      recordStatus.textContent = 'Capture failed: ' + err.message;
    }
    setTimeout(() => { recordStatus.textContent = ''; }, 5000);
    pagesBtn.disabled = false;
  });

  // ---- Floating quick actions (proxy the sidebar buttons) ----
  const fabPlay = document.getElementById('latexFabPlay');
  const fabRecord = document.getElementById('latexFabRecord');
  fabPlay.addEventListener('click', () => startBtn.click());
  fabRecord.addEventListener('click', () => recordBtn.click());
  // mirror the record button's busy state
  new MutationObserver(() => { fabRecord.disabled = recordBtn.disabled; })
    .observe(recordBtn, { attributes: true, attributeFilter: ['disabled'] });

  // ---- Events ----
  startBtn.addEventListener('click', startAnimation);
  resetBtn.addEventListener('click', reset);
  pauseBtn.addEventListener('click', togglePause);
  instantBtn.addEventListener('click', instant);

  // Re-typeset on input or font-mode change (font metrics differ).
  let inputTimer = null;
  input.addEventListener('input', () => {
    preset.value = 'custom';
    clearTimeout(inputTimer);
    inputTimer = setTimeout(render, 350);
  });
  fontSel.addEventListener('change', render);

  // Setting .value doesn't fire 'input', so re-typeset explicitly.
  preset.addEventListener('change', () => {
    const src = LATEX_PRESETS[preset.value];
    if (!src) return;
    clearTimeout(inputTimer);
    input.value = src;
    render();
  });

  // Live (no re-typeset) — restyle / re-chunk only.
  fontSize.addEventListener('input', () => {
    document.getElementById('latexFontSizeValue').textContent = fontSize.value + 'px';
    applyStyles();
    updateCaret(events[eventIndex - 1] ? events[eventIndex - 1][events[eventIndex - 1].length - 1] : null);
    if (floatState && floatState.p.layout === 'cascade') startFloat(); // step depends on font size
  });
  displayHeight.addEventListener('input', () => {
    document.getElementById('latexDisplayHeightValue').textContent = displayHeight.value + 'px';
    applyStyles();
  });
  displayPadding.addEventListener('input', () => {
    document.getElementById('latexDisplayPaddingValue').textContent = displayPadding.value + 'px';
    applyStyles();
  });
  lineHeight.addEventListener('input', () => {
    document.getElementById('latexLineHeightValue').textContent = (lineHeight.value / 100) + 'em';
    applyStyles();
    updateCaret(events[eventIndex - 1] ? events[eventIndex - 1][events[eventIndex - 1].length - 1] : null);
    if (floatState && floatState.p.layout === 'cascade') startFloat(); // step depends on line spacing
  });
  speed.addEventListener('input', () => { document.getElementById('latexSpeedValue').textContent = speed.value + 'ms'; });
  charsPerTick.addEventListener('input', () => {
    document.getElementById('latexCharsPerTickValue').textContent = charsPerTick.value;
    buildEvents();
    resetReveal();
  });
  function syncFloatControls() {
    floatControls.style.display = typingEffect.value === 'float' ? '' : 'none';
    particleControls.style.display = typingEffect.value === 'particles' ? '' : 'none';
    zoomControls.style.display = typingEffect.value === 'zoom' ? '' : 'none';
    cellControls.style.display = typingEffect.value === 'cell' ? '' : 'none';
  }
  typingEffect.addEventListener('change', () => {
    syncFloatControls();
    stopFloat();
    stopParticles();
    stopCinema();
    buildEvents();
    resetReveal();
  });

  // Cinematic sliders: labels always; density/cell-count restart, the rest
  // apply live to the running sim.
  const cinemaSlider = (el, valueId, fmt, restart) => {
    el.addEventListener('input', () => {
      document.getElementById(valueId).textContent = fmt(el.value);
      if (!cinemaState) return;
      if (restart) startCinema(cinemaState.mode);
      else cinemaState.sim.setParams(cinemaState.mode === 'zoom' ? zoomParams() : cellParams());
    });
  };
  cinemaSlider(zoomCount, 'latexZoomCountValue', v => v, true);
  cinemaSlider(zoomTravel, 'latexZoomTravelValue', v => v + 's', false);
  cinemaSlider(zoomTilt, 'latexZoomTiltValue', v => v + '°', false);
  cinemaSlider(zoomDepth, 'latexZoomDepthValue', v => parseFloat(v).toFixed(1), false);
  cinemaSlider(zoomPersp, 'latexZoomPerspValue', v => parseFloat(v).toFixed(1), false);
  cinemaSlider(zoomBlur, 'latexZoomBlurValue', v => v, false);
  zoomDiagrams.addEventListener('change', () => {
    if (cinemaState && cinemaState.mode === 'zoom') startCinema('zoom'); // sprite pool changes
  });
  cinemaSlider(cellCount, 'latexCellCountValue', v => v, true);
  cinemaSlider(cellFlow, 'latexCellFlowValue', v => v + 's', false);
  cinemaSlider(cellTilt, 'latexCellTiltValue', v => v + '°', false);
  cinemaSlider(cellBlur, 'latexCellBlurValue', v => v, false);

  // Particle sliders: labels always; count restarts (pool size is fixed at
  // build), everything else applies live to the running engine.
  partCount.addEventListener('input', () => {
    document.getElementById('latexPartCountValue').textContent = partCount.value;
    if (particleState) startParticles();
  });
  partSize.addEventListener('input', () => {
    document.getElementById('latexPartSizeValue').textContent = (parseInt(partSize.value) / 10) + 'px';
    if (particleState) particleState.engine.setParams(particleParams());
  });
  partGlow.addEventListener('input', () => {
    document.getElementById('latexPartGlowValue').textContent = partGlow.value + '%';
    if (particleState) particleState.engine.setParams(particleParams());
  });
  partBlend.addEventListener('change', () => {
    if (particleState) particleState.engine.setParams(particleParams());
  });
  partMorph.addEventListener('input', () => {
    document.getElementById('latexPartMorphValue').textContent = partMorph.value + 'ms';
    if (particleState) particleState.engine.setParams(particleParams());
  });
  partHold.addEventListener('input', () => {
    document.getElementById('latexPartHoldValue').textContent = partHold.value + 'ms';
    if (particleState) particleState.engine.setParams(particleParams());
  });
  partScatter.addEventListener('input', () => {
    document.getElementById('latexPartScatterValue').textContent = partScatter.value;
    if (particleState) particleState.engine.setParams(particleParams());
  });
  partIdle.addEventListener('input', () => {
    document.getElementById('latexPartIdleValue').textContent = partIdle.value;
    if (particleState) particleState.engine.setParams(particleParams());
  });
  partCymScale.addEventListener('input', () => {
    document.getElementById('latexPartCymScaleValue').textContent = partCymScale.value + 'px';
    if (particleState) {
      particleState.engine.setParams(particleParams());
      particleState.engine._newFieldMode(); // re-ring the plate at the new scale
    }
  });
  partCymSize.addEventListener('input', () => {
    document.getElementById('latexPartCymSizeValue').textContent = partCymSize.value + 'px';
    if (particleState) particleState.engine.setParams(particleParams()); // read live per frame
  });
  partNoise.addEventListener('change', () => {
    if (particleState) {
      particleState.engine.setParams(particleParams());
      particleState.engine._newFieldMode(); // switch pattern families immediately
    }
  });
  partLines.addEventListener('input', () => {
    document.getElementById('latexPartLinesValue').textContent = partLines.value;
    if (particleState) particleState.engine.setParams(particleParams()); // next group uses it
  });
  partPlace.addEventListener('change', () => {
    if (particleState) particleState.engine.setParams(particleParams()); // next group uses it
  });
  partRelicMode.addEventListener('change', () => {
    if (particleState) startParticles(); // form pool must be (re)carved
  });

  // Layout changes the unit structure (1 vs 4 elements) and reveal changes
  // placement-time glyph prep, so both restart the run.
  floatLayout.addEventListener('change', () => {
    if (floatState) startFloat();
  });
  floatReveal.addEventListener('change', () => {
    if (floatState) startFloat();
  });

  // Float sliders: labels always; density restarts the run, the rest apply live.
  floatCount.addEventListener('input', () => {
    document.getElementById('latexFloatCountValue').textContent = floatCount.value;
    if (floatState) startFloat();
  });
  floatLife.addEventListener('input', () => {
    document.getElementById('latexFloatLifeValue').textContent = (parseInt(floatLife.value) / 10).toFixed(1) + 's';
    if (floatState) floatState.p = floatParams();
  });
  floatZoom.addEventListener('input', () => {
    document.getElementById('latexFloatZoomValue').textContent = '×' + (parseInt(floatZoom.value) / 10).toFixed(1);
    if (floatState) floatState.p = floatParams();
  });
  floatFade.addEventListener('input', () => {
    document.getElementById('latexFloatFadeValue').textContent = floatFade.value + '%';
    if (floatState) floatState.p = floatParams();
  });
  floatFadeIn.addEventListener('input', () => {
    document.getElementById('latexFloatFadeInValue').textContent = floatFadeIn.value + '%';
    if (floatState) floatState.p = floatParams();
  });
  themeSel.addEventListener('change', applyStyles);
  alignSel.addEventListener('change', applyStyles);
  renderSize.addEventListener('change', applyStyles);
  [cursorOpt, cursorBlink].forEach(el => el.addEventListener('change', applyStyles));

  // ---- Boot ----
  applyStyles();
  async function waitForMathJax() {
    for (let i = 0; i < 200; i++) {
      if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise
          && typeof window.MathJax.typesetPromise === 'function') {
        await window.MathJax.startup.promise;
        return true;
      }
      await new Promise(r => setTimeout(r, 50));
    }
    return false;
  }
  waitForMathJax().then(ok => {
    if (!ok) return;
    // Derived presets evolve with the code, but persistence restores the
    // stored input text verbatim — refresh it from the preset so a stale
    // snapshot never shadows the current preset content. (User-edited text
    // is safe: any edit flips the preset select to "custom".)
    if (LATEX_PRESETS[preset.value]) input.value = LATEX_PRESETS[preset.value];
    mathReady = true;
    render();
  });
}
