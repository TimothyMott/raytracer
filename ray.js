let debug = false;

const EPSILON = 1e-6;
const LITTLE_SPACE = 1e-3;	// let's leave room between things, e.g., don't put them right on the floor. Used automatically in object constructors, not primitives: e.g., use Ball instead of Sphere
const MAX_TRACE_DIST = 100;
const MAX_DEPTH = 20;
const SUB_SAMPLE = 2;   // split each pixel into virtual SUB_SAMPLE × SUB_SAMPLE grid, then average results.

// --------------------------------
//            colours
// --------------------------------
const COL_BLACK = { r: 0, g: 0, b: 0, a: 0 };
const COL_WHITE = { r: 255, g: 255, b: 255, a: 1 };
const COL_DARK_GREY = { r: 64, g: 64, b: 64, a: 1 };
const COL_VERY_DARK_GREY = { r: 16, g: 16, b: 16, a: 1 };
const COL_GREY = { r: 128, g: 128, b: 128, a: 1 };
const COL_SILVER = { r: 192, g: 192, b: 192, a: 1 };
const COL_RED = { r: 192, g: 0, b: 0, a: 1 };
const COL_LIME_GREEN = { r: 112, g: 160, b: 0, a: 1 };
const COL_YELLOW = { r: 240, g: 224, b: 8, a: 1 };
const COL_MAUVE = { r: 64, g: 32, b: 112, a: 1 };
const COL_DEEP_BLUE = { r: 8, g: 8, b: 64, a: 1 };
const COL_SKY_BLUE = { r: 128, g: 128, b: 224, a: 1 };
const COL_WARM_GREY = { r: 144, g: 128, b: 128, a: 1 };
const COL_ORANGE_ORANGE = { r: 224, g: 124, b: 32 };
const COL_GRAPEFRUIT_YELLOW = { r: 248, g: 210, b: 112 };
const COL_DEEP_PINK = { r: 255, g: 32, b: 144 };
const COL_COPPER = { r: 174, g: 105, b: 56 };

// --------------------------------
//            materials
// --------------------------------
const MAT_AIR = 0;
const MAT_OPAQUE = 1;
const MAT_GLASS = 2;
const MAT_WATER = 3;
// --------------------------------
// materials: indices of refraction
// --------------------------------
const matRefrIndex = [];
matRefrIndex[MAT_AIR] = 1.0;
matRefrIndex[MAT_OPAQUE] = undefined;
matRefrIndex[MAT_GLASS] = 1.5;
matRefrIndex[MAT_WATER] = 1.33;
// --------------------------------
// materials: reflectance
// --------------------------------
// to do: 1) get rid of reflectance and specular in object constructors; specify them automatically based on material
//        2) therefore add variety of materials with different reflectance and specular coeffs
//        3) add flag for whether material refracts or not (currently checking MAT_OPAQUE; get rid of that)
const matRefl = [];
matRefl[MAT_AIR] = 0;
matRefl[MAT_OPAQUE] = 0.2;
matRefl[MAT_GLASS] = 1;
matRefl[MAT_WATER] = 1;
// --------------------------------
// materials: specular (as fraction of reflectance; remainder is Lambertian, i.e., diffuse)
// --------------------------------
const matSpec = [];
matSpec[MAT_AIR] = 0;
matSpec[MAT_OPAQUE] = 0.5;
matSpec[MAT_GLASS] = 1;
matSpec[MAT_WATER] = 1;


function vecPlus(v, w) { return [v[0] + w[0], v[1] + w[1], v[2] + w[2]]; }
function vecMinus(v, w) { return[v[0] - w[0], v[1] - w[1], v[2] - w[2]]; }
function vecScalar(k, v) { return [k * v[0], k * v[1], k * v[2]]; }
function vecDot(v, w) { return v[0] * w[0] + v[1] * w[1] + v[2] * w[2]; }
function vecCross(v, w) { return [v[1] * w[2] - v[2] * w[1], v[2] * w[0] - v[0] * w[2], v[0] * w[1] - v[1] * w[0]]; }
function vecIsZero(v) { return vecSqLength(v) < EPSILON; }
function vecNormalize(v) { return vecIsZero(v) ? [0, 0, 1] : vecScalar(1 / vecLength(v), v); }
function vecSqLength(v) { return vecDot(v, v); }
function vecLength(v) { return Math.sqrt(vecSqLength(v)); }
function vecPerturb(v, maxDeviation) {	// create random vector chosen around v with angle less than deviation
	if (maxDeviation == undefined || maxDeviation > Math.PI / 2) {
		maxDeviation = maxDeviation || Math.PI / 2;
	}

	let m = [1, 0, 0];	// generate m and n orthogonal to v: pick any m not parallel to v, use it to make n, then redefine m
	if (vecIsZero(vecCross(v, m))) {
		m = [0, 1, 0];
	}
	let n = vecCross(v, m);
	m = vecCross(n, v);

	let lowerBound = Math.cos(maxDeviation) ** 2;
	let x = (1 - lowerBound) * Math.random() + lowerBound;
	
	let cosTheta = Math.sqrt(x);
	let sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
	let phi = 2 * Math.PI * Math.random();

	let v2 = vecPlus(vecPlus(vecScalar(cosTheta, v), vecScalar(sinTheta * Math.cos(phi), m)), vecScalar(sinTheta * Math.sin(phi), n));
	if (vecDot(v, v2) < 0) {
		throw new Error("oh noooo")
	}

	return v2;
}

function colour(col) { return { r: col.r, g: col.g, b: col.b, a: col.a } };

class Box {		// actually a parallelepiped
	constructor(shapes, vtxA, edgeAB, edgeAC, edgeAD, baseColour, reflectance, specular, material) {
		let adjVtxA = vecPlus(vecPlus(vecPlus(vtxA, vecScalar(LITTLE_SPACE, vecNormalize(edgeAB))),
																								vecScalar(LITTLE_SPACE, vecNormalize(edgeAC))),
																								vecScalar(LITTLE_SPACE, vecNormalize(edgeAD)));
		let adjEdgeAB = vecMinus(edgeAB, vecScalar(2 * LITTLE_SPACE, vecNormalize(edgeAB)));
		let adjEdgeAC = vecMinus(edgeAC, vecScalar(2 * LITTLE_SPACE, vecNormalize(edgeAC)));
		let adjEdgeAD = vecMinus(edgeAD, vecScalar(2 * LITTLE_SPACE, vecNormalize(edgeAD)));
		let oppVtx = vecPlus(vecPlus(vecPlus(adjVtxA, adjEdgeAB), adjEdgeAC), adjEdgeAD);
		let adjEdgeBA = vecScalar(-1, adjEdgeAB);
		let adjEdgeCA = vecScalar(-1, adjEdgeAC);
		let adjEdgeDA = vecScalar(-1, adjEdgeAD);

		shapes.push(new Square(adjVtxA, adjEdgeAC, adjEdgeAB, baseColour, reflectance, specular, material));
		shapes.push(new Square(adjVtxA, adjEdgeAD, adjEdgeAC, baseColour, reflectance, specular, material));
		shapes.push(new Square(adjVtxA, adjEdgeAB, adjEdgeAD, baseColour, reflectance, specular, material));
		shapes.push(new Square(oppVtx, adjEdgeBA, adjEdgeCA, baseColour, reflectance, specular, material));
		shapes.push(new Square(oppVtx, adjEdgeCA, adjEdgeDA, baseColour, reflectance, specular, material));
		shapes.push(new Square(oppVtx, adjEdgeDA, adjEdgeBA, baseColour, reflectance, specular, material));					
	}
}

class Prism {		// triangular prism: ABC is triangle; square base in ABD plane
	constructor(shapes, vtxA, edgeAB, edgeAC, edgeAD, baseColour, reflectance, specular, material) {
		let adjVtxA = vecPlus(vecPlus(vecPlus(vtxA, vecScalar(LITTLE_SPACE, vecNormalize(edgeAB))),
																								vecScalar(LITTLE_SPACE, vecNormalize(edgeAC))),
																								vecScalar(LITTLE_SPACE, vecNormalize(edgeAD)));
		let adjEdgeAB = vecMinus(edgeAB, vecScalar(2 * LITTLE_SPACE, vecNormalize(edgeAB)));
		let adjEdgeAC = vecMinus(edgeAC, vecScalar(2 * LITTLE_SPACE, vecNormalize(edgeAC)));
		let adjEdgeAD = vecMinus(edgeAD, vecScalar(2 * LITTLE_SPACE, vecNormalize(edgeAD)));	
		let oppVtx = vecPlus(vecPlus(adjVtxA, adjEdgeAC), adjEdgeAD);
		let adjEdgeCA = vecScalar(-1, adjEdgeAC);
		let adjEdgeCB = vecPlus(adjEdgeCA, adjEdgeAB);
		let adjEdgeDA = vecScalar(-1, adjEdgeAD);

		shapes.push(new Triangle(adjVtxA, adjEdgeAC, adjEdgeAB, baseColour, reflectance, specular, material));
		shapes.push(new Square(adjVtxA, adjEdgeAD, adjEdgeAC, baseColour, reflectance, specular, material));
		shapes.push(new Square(adjVtxA, adjEdgeAB, adjEdgeAD, baseColour, reflectance, specular, material));
		shapes.push(new Triangle(oppVtx, adjEdgeCA, adjEdgeCB, baseColour, reflectance, specular, material));
		shapes.push(new Square(oppVtx, adjEdgeCB, adjEdgeDA, baseColour, reflectance, specular, material));					
	}
}

class Cuboctahedron {		// start with cube, cut off corners (which is why A is called chopped vertex; B, C, D are also chopped)
	constructor(shapes, choppedVtxA, edgeAB, edgeAC, edgeAD, baseColourSquare, baseColourTriangle, reflectance, specular, material) {
		let adjVtxA = vecPlus(vecPlus(vecPlus(choppedVtxA, vecScalar(LITTLE_SPACE, vecNormalize(edgeAB))),
																											 vecScalar(LITTLE_SPACE, vecNormalize(edgeAC))),
																											 vecScalar(LITTLE_SPACE, vecNormalize(edgeAD)));
		// create 12 vertices: combinations of up/down, nesw; A is down south west.
		let ds = vecPlus(adjVtxA, vecScalar(0.5 - LITTLE_SPACE / vecLength(edgeAB), edgeAB));
		let dw = vecPlus(adjVtxA, vecScalar(0.5 - LITTLE_SPACE / vecLength(edgeAC), edgeAC));
		let dn = vecPlus(ds, vecScalar(1 - 2 * LITTLE_SPACE / vecLength(edgeAC), edgeAC));
		let de = vecPlus(dw, vecScalar(1 - 2 * LITTLE_SPACE / vecLength(edgeAB), edgeAB));

		let sw = vecPlus(adjVtxA, vecScalar(0.5 - LITTLE_SPACE / vecLength(edgeAD), edgeAD));
		let nw = vecPlus(sw, vecScalar(1 - 2 * LITTLE_SPACE / vecLength(edgeAC), edgeAC));
		let ne = vecPlus(nw, vecScalar(1 - 2 * LITTLE_SPACE / vecLength(edgeAB), edgeAB));
		let se = vecPlus(sw, vecScalar(1 - 2 * LITTLE_SPACE / vecLength(edgeAB), edgeAB));
		
		let un = vecPlus(dn, vecScalar(1 - 2 * LITTLE_SPACE / vecLength(edgeAD), edgeAD));
		let ue = vecPlus(de, vecScalar(1 - 2 * LITTLE_SPACE / vecLength(edgeAD), edgeAD));
		let us = vecPlus(ds, vecScalar(1 - 2 * LITTLE_SPACE / vecLength(edgeAD), edgeAD));
		let uw = vecPlus(dw, vecScalar(1 - 2 * LITTLE_SPACE / vecLength(edgeAD), edgeAD));

		shapes.push(new Square(ds, vecMinus(dw, ds), vecMinus(de, ds), baseColourSquare, reflectance, specular, material));
		shapes.push(new Square(ne, vecMinus(dn, ne), vecMinus(un, ne), baseColourSquare, reflectance, specular, material));
		shapes.push(new Square(se, vecMinus(de, se), vecMinus(ue, se), baseColourSquare, reflectance, specular, material));
		shapes.push(new Square(sw, vecMinus(ds, sw), vecMinus(us, sw), baseColourSquare, reflectance, specular, material));
		shapes.push(new Square(nw, vecMinus(dw, nw), vecMinus(uw, nw), baseColourSquare, reflectance, specular, material));
		shapes.push(new Square(us, vecMinus(ue, us), vecMinus(uw, us), baseColourSquare, reflectance, specular, material));
	
		shapes.push(new Triangle(dn, vecMinus(ne, dn), vecMinus(de, dn), baseColourTriangle, reflectance, specular, material));
		shapes.push(new Triangle(de, vecMinus(se, de), vecMinus(ds, de), baseColourTriangle, reflectance, specular, material));
		shapes.push(new Triangle(ds, vecMinus(sw, ds), vecMinus(dw, ds), baseColourTriangle, reflectance, specular, material));
		shapes.push(new Triangle(dw, vecMinus(nw, dw), vecMinus(dn, dw), baseColourTriangle, reflectance, specular, material));
		shapes.push(new Triangle(un, vecMinus(ue, un), vecMinus(ne, un), baseColourTriangle, reflectance, specular, material));
		shapes.push(new Triangle(ue, vecMinus(us, ue), vecMinus(se, ue), baseColourTriangle, reflectance, specular, material));
		shapes.push(new Triangle(us, vecMinus(uw, us), vecMinus(sw, us), baseColourTriangle, reflectance, specular, material));
		shapes.push(new Triangle(uw, vecMinus(un, uw), vecMinus(nw, uw), baseColourTriangle, reflectance, specular, material));
	}
}

class Ball {	// normally use this instead of Sphere (to leave a LITTLE_SPACE)
	constructor(shapes, centre, radius, baseColour, reflectance, specular, material) {
		shapes.push(new Sphere(centre, radius - LITTLE_SPACE, baseColour, reflectance, specular, material));
	}
}

class Halfball {	// normalDir points away from hemisphere direction (so disc is on top)
	constructor(shapes, centre, radius, normalDir, truncateMin, truncateMax, baseColour, reflectance, specular, material) {
		let adjTrMin = (truncateMin == undefined) ? LITTLE_SPACE : truncateMin + LITTLE_SPACE;
		let adjTrMax = (truncateMax == undefined) ? undefined : truncateMax - LITTLE_SPACE;
		shapes.push(new Hemisphere(centre, radius - LITTLE_SPACE, vecScalar(-1, normalDir), adjTrMin, adjTrMax, true, baseColour, reflectance, specular, material));
		shapes.push(new Disc(vecPlus(centre, vecScalar(-1 * adjTrMin, vecNormalize(normalDir))), Math.sqrt((radius - LITTLE_SPACE) ** 2 - adjTrMin ** 2), normalDir, baseColour, reflectance, specular, material));
		if (truncateMax < radius) {  // possibly add cap on other end
			shapes.push(new Disc(vecPlus(centre, vecScalar(-1 * adjTrMax, vecNormalize(normalDir))), Math.sqrt((radius - LITTLE_SPACE) ** 2 - adjTrMax ** 2), vecScalar(-1, normalDir), baseColour, reflectance, specular, material));
		}
	}
}

class Bowl {	// normalDir points in direction of rim
	// TO DO: add truncate; see Halfball
	constructor(shapes, centre, outerRadius, innerRadius, normalDir, baseColour, reflectance, specular, material) {
		shapes.push(new Hemisphere(centre, outerRadius - LITTLE_SPACE, vecScalar(-1, normalDir), 0, undefined, true, baseColour, reflectance, specular, material));
		shapes.push(new Hemisphere(centre, innerRadius + LITTLE_SPACE, vecScalar(-1, normalDir), 0, undefined, false, baseColour, reflectance, specular, material));
		shapes.push(new Annulus(centre, outerRadius - LITTLE_SPACE, innerRadius + LITTLE_SPACE, normalDir, baseColour, reflectance, specular, material));
	}
}

class Lightbulb {
	constructor(lights, centre, radius, dir, wattage) {
		//new 
	}
}

class Spotlight {
	constructor(shapes, lights, centre, radius, dir, wattage) {
		new Bowl(shapes, centre, 1.25 * radius, radius, dir, COL_COPPER, 0.7, 0.7, MAT_OPAQUE);
		//shapes.push(new Disc(centre, radius, dir, COL_WHITE, 0.1, 0.7, MAT_OPAQUE));
		lights.push(new Disc(vecPlus(centre, vecScalar(-0.1 * radius, vecNormalize(dir))), radius, dir, COL_WHITE, 0.1, 0.7, MAT_OPAQUE));
		//new Lightbulb(lights, centre, radius, dir, wattage);
	}
}

// --------------------------------
//           primitives
// objects in Shape class are exact
// (i.e., they don't use LITTLE_SPACE)
// --------------------------------
class Shape {
	constructor() {
		this.baseColour = COL_DARK_GREY;
		this.specular = 0.5;
		this.material = MAT_OPAQUE;
	}
	colour() { return this.baseColour; }
}

class Cylinder extends Shape {
	// to do: make Band primitive that is Cylinder with limited height; make Tube, Cup, and Can forms (cylinder with 0, 1, 2 caps resp.)
  constructor(centre, axis, height, radius, baseColour, reflectance, specular, material) {
		super();
		
		this.type = 'cylinder';
		this.centre = centre;
		this.axis = vecNormalize(axis);
		this.height = height;
		this.radius = radius;
		this.baseColour = baseColour || COL_WHITE;
		this.reflectance = (reflectance == undefined) ? 0.5 : reflectance;
		this.specular = (specular == undefined) ? 0.8 : specular;
		this.material = (material == undefined) ? MAT_OPAQUE : material;
	}
    
  normal(p) {
		let v = vecMinus(p, this.centre);
		return vecScalar(1 / this.radius, vecMinus(v, vecScalar(vecDot(v, this.axis), this.axis)) );
	}
}

class Sphere extends Shape {
	constructor(centre, radius, baseColour, reflectance, specular, material) {
		super();

		this.type = 'sphere';
		this.centre = centre;
		this.radius = radius;
		this.baseColour = baseColour || COL_RED;
		this.reflectance = (reflectance == undefined) ? 0.5 : reflectance;
		this.specular = (specular == undefined) ? 0.5 : specular;
		this.material = (material == undefined) ? MAT_OPAQUE : material;
	}

	normal(p) { return vecScalar(1 / this.radius, vecMinus(p, this.centre)); }
}

class Hemisphere extends Shape {	// normalDir points towards half that exists; truncate is minimum distance along normal
	constructor(centre, radius, normalDir, truncateMin, truncateMax, convex, baseColour, reflectance, specular, material) {
		super();

		this.type = 'hemisphere';
		this.centre = centre;
		this.radius = radius;
		this.normalDir = vecNormalize(normalDir);
		this.truncateMin = truncateMin;
		this.truncateMax = truncateMax;
		this.convex = convex;	// if true, surface points away from centre
		this.baseColour = baseColour || COL_RED;
		this.reflectance = (reflectance == undefined) ? 0.5 : reflectance;
		this.specular = (specular == undefined) ? 0.5 : specular;
		this.material = (material == undefined) ? MAT_OPAQUE : material;
	}

	normal(p) { return vecScalar((this.convex ? 1 : -1) / this.radius, vecMinus(p, this.centre)); }
}

class Plane extends Shape {
	constructor(origin, normalDir, baseColour, reflectance, specular, material) {
		super();

		this.type = 'plane';
		this.origin = origin;
		this.normalDir = vecNormalize(normalDir);
		this.baseColour = baseColour || COL_DEEP_BLUE;
		this.reflectance = (reflectance == undefined) ? 0.5 : reflectance;
		this.specular = (specular == undefined) ? 0.1 : specular;
		this.material = (material == undefined) ? MAT_OPAQUE : material;
	}

	normal() { return this.normalDir; }
}

class Triangle extends Shape {
	constructor(vtxA, edgeAB, edgeAC, baseColour, reflectance, specular, material) {
		super();

		this.type = 'triangle';
		this.vtxA = vtxA;
		this.edgeAB = edgeAB;
		this.edgeAC = edgeAC;
		this.normalDir = vecNormalize(vecCross(this.edgeAB, this.edgeAC));
		this.baseColour = baseColour || COL_LIME_GREEN;
		this.reflectance = (reflectance == undefined) ? 0.5 : reflectance;
		this.specular = (specular == undefined) ? 0.2 : specular;
		this.material = (material == undefined) ? MAT_OPAQUE : material;
	}

	normal() { return this.normalDir; }
}

class Square extends Shape {	// actually a parallelogram
	constructor(vtxA, edgeAB, edgeAC, baseColour, reflectance, specular, material) {
		super();

		this.type = 'square';
		this.vtxA = vtxA;
		this.edgeAB = edgeAB;
		this.edgeAC = edgeAC;
		this.normalDir = vecNormalize(vecCross(this.edgeAB, this.edgeAC));
		this.baseColour = baseColour || COL_DEEP_PINK;
		this.reflectance = (reflectance == undefined) ? 0.5 : reflectance;
		this.specular = (specular == undefined) ? 0.35 : specular;
		this.material = (material == undefined) ? MAT_OPAQUE : material;
	}

	normal() { return this.normalDir; }
}

class Disc extends Shape {
	constructor(centre, radius, normalDir, baseColour, reflectance, specular, material) {
		super();

		this.type = 'disc';
		this.centre = centre;
		this.radius = radius;
		this.normalDir = vecNormalize(normalDir);
		this.baseColour = baseColour || COL_DEEP_PINK;
		this.reflectance = (reflectance == undefined) ? 0.5 : reflectance;
		this.specular = (specular == undefined) ? 0.5 : specular;
		this.material = (material == undefined) ? MAT_OPAQUE : material;
	}

	normal() { return this.normalDir; }
}

class Annulus extends Shape {
	constructor(centre, outerRadius, innerRadius, normalDir, baseColour, reflectance, specular, material) {
		super();

		this.type = 'annulus';
		this.centre = centre;
		this.outerRadius = outerRadius;
		this.innerRadius = innerRadius;
		this.normalDir = vecNormalize(normalDir);
		this.baseColour = baseColour || COL_DEEP_PINK;
		this.reflectance = (reflectance == undefined) ? 0.5 : reflectance;
		this.specular = (specular == undefined) ? 0.5 : specular;
		this.material = (material == undefined) ? MAT_OPAQUE : material;
	}

	normal() { return this.normalDir; }
}

class Ray {
	constructor(origin, dir) {
		this.origin = origin;
		this.dir = vecNormalize(dir);
	}

	intersectDist(shape) {
		switch (shape.type) {
			case 'plane': {
				let a = shape.origin;
				let n = shape.normalDir;

				if (Math.abs(vecDot(this.dir, n)) < EPSILON) {
					return undefined;
				}

				let t = vecDot(vecMinus(a, this.origin), n) / vecDot(this.dir, n);
				return t > EPSILON ? t : undefined;
			}	case 'sphere': {
				let a = 1;
				let halfB = vecDot(this.dir, vecMinus(this.origin, shape.centre));
				let c = vecSqLength(vecMinus(this.origin, shape.centre)) - shape.radius * shape.radius;

				let t = qRoots(a, halfB, c);
				if (t == undefined) {
					return undefined;
				} else {
					if (t[0] > EPSILON) {
						return t[0];
					} else {
						if (t[1] > EPSILON) {
							return t[1];
						}
					}
				}
				return undefined;
			} case 'hemisphere': {
				let a = 1;
				let halfB = vecDot(this.dir, vecMinus(this.origin, shape.centre));
				let c = vecSqLength(vecMinus(this.origin, shape.centre)) - shape.radius * shape.radius;

				let t = qRoots(a, halfB, c);
				if (t == undefined) {
					return undefined;
				} else {
					for (let i in [0, 1]) {	// check intersections to see whether they're in positive direction along ray and in the proper halfspace (at distance within min / max truncation)
						if (t[i] > EPSILON) {
							let pos = vecPlus(this.origin, vecScalar(t[i], this.dir));
							let proj = vecDot(vecMinus(pos, shape.centre), shape.normalDir);
							if (proj > shape.truncateMin && (shape.truncateMax == undefined || proj < shape.truncateMax)) {
								return t[i];
							}
						} 
					}
					return undefined;
				}
			} case 'cylinder': {
				let centre = shape.centre;
				let axis = shape.axis;
				let v = vecMinus(this.origin, centre);
				
				let vd = vecDot(v, this.dir);
				let va = vecDot(v, axis);			
				let da = vecDot(this.dir, axis);

				let a = 1 - da * da;
				let halfB = vd - va * da;
				let c = vecSqLength(v) - va * va - shape.radius * shape.radius;

				let t = qRoots(a, halfB, c);

				if (t == undefined || t[0] <= 0) {
					return undefined;
				}
				return t[0];
			} case 'triangle': {
				// Möller-Trumbore algorithm
				let h = vecCross(this.dir, shape.edgeAC);
				let a = vecDot(shape.edgeAB, h);
				if (a > -EPSILON && a < EPSILON) {
					return undefined;
				}
				let f = 1 / a;
				let s = vecMinus(this.origin, shape.vtxA);
				let u = f * vecDot(s, h);
				if (u < 0 || u > 1) {
					return undefined;
				}
				let q = vecCross(s, shape.edgeAB);
				let v = f * vecDot(this.dir, q);
				if (v < 0 || u + v > 1) {
					return undefined;
				}

				let t = f * vecDot(shape.edgeAC, q);
				return (t > EPSILON) ? t : undefined;
			} case 'square': {
				// Möller-Trumbore algorithm
				let h = vecCross(this.dir, shape.edgeAC);
				let a = vecDot(shape.edgeAB, h);
				if (a > -EPSILON && a < EPSILON) {
					return undefined;
				}
				let f = 1 / a;
				let s = vecMinus(this.origin, shape.vtxA);
				let u = f * vecDot(s, h);
				if (u < 0 || u > 1) {
					return undefined;
				}
				let q = vecCross(s, shape.edgeAB);
				let v = f * vecDot(this.dir, q);
				if (v < 0 || v > 1) {
					return undefined;
				}

				let t = f * vecDot(shape.edgeAC, q);
				return (t > EPSILON) ? t : undefined;
			} case 'disc': {
				let c = shape.centre;
				let n = shape.normalDir;

				if (Math.abs(vecDot(this.dir, n)) < EPSILON) {
					return undefined;
				}

				let t = vecDot(vecMinus(c, this.origin), n) / vecDot(this.dir, n);
				if (t > EPSILON) {	// hits plane of disc; now check radius
					let pos = vecPlus(this.origin, vecScalar(t, this.dir));
					return (vecSqLength(vecMinus(c, pos)) + EPSILON < shape.radius * shape.radius) ? t : undefined;
				}
				return undefined;
			} case 'annulus': {
				let c = shape.centre;
				let n = shape.normalDir;

				if (Math.abs(vecDot(this.dir, n)) < EPSILON) {
					return undefined;
				}

				let t = vecDot(vecMinus(c, this.origin), n) / vecDot(this.dir, n);
				if (t > EPSILON) {	// hits plane of disc; now check radii
					let pos = vecPlus(this.origin, vecScalar(t, this.dir));
					let rSq = vecSqLength(vecMinus(c, pos));
					return (rSq + EPSILON < shape.outerRadius * shape.outerRadius && rSq - EPSILON > shape.innerRadius * shape.innerRadius) ? t : undefined;
				}
				return undefined;
			} default: {
				throw new Error(`I didn't recognize the shape! (${shape.type})`);
				return undefined;
			}
		}
	}
}

class Camera {
	constructor(origin, gazeDir, up, width, height, fieldOfView) {
		this.origin = origin;
		this.width = width;
		this.height = height;
		this.fieldOfView = fieldOfView || 45;
		this.fovRadians = Math.PI / 180 * (this.fieldOfView / 2);
		this.fovScaleWidth = Math.tan(this.fovRadians);
		this.fovScaleHeight = this.fovScaleWidth * this.height / this.width;		
		// find orthonormal basis corresponding to camera angle
		this.up = up;
		this.ONBw = vecNormalize(vecScalar(-1, gazeDir));
		this.ONBu = vecNormalize(vecCross(this.up, this.ONBw));
		this.ONBv = vecCross(this.ONBw, this.ONBu);
	}

	toUVW(xyz) {
		let transXyz = vecMinus(xyz, this.origin);
		return [vecDot(transXyz, this.ONBu), vecDot(transXyz, this.ONBv), vecDot(transXyz, this.ONBw)];
	}
	toXYZ(uvw) { return vecPlus(vecPlus(vecPlus(this.origin, vecScalar(uvw[0], this.ONBu)), vecScalar(uvw[1], this.ONBv)), vecScalar(uvw[2], this.ONBw)) };
}

class Scene {
	constructor(ctx) {
		this.ctx = ctx;
		this.canvasWidth = ctx.width;
		this.canvasHeight = ctx.height;
		this.shapes = [];
		this.lights = [];
	}

	loadPreset(def) {
		switch (def) {
			case 0:
				this.shapes = [
					new Plane([0, 0, 0], [0, 0, 1], COL_WHITE, 0.2),
					new Plane([0, 80, 0], [0, -1, 0], COL_SKY_BLUE),
					new Plane([0, -80, 0], [0, 1, 0], COL_VERY_DARK_GREY),
					new Plane([80, 0, 0], [-1, 0, 0], COL_VERY_DARK_GREY),
					new Plane([-80, 0, 0], [1, 0, 0], COL_VERY_DARK_GREY),
					new Plane([0, 0, 80], [1, 0, -1], COL_VERY_DARK_GREY),
					//new Plane([0, 0, 80], [1, 0, -1], COL_WHITE),
					// */
					new Sphere([0.3, 0, 0.9], 0.4, COL_RED, 0.90),
					new Sphere([-1.1, 1.2, 0.25], 0.25, COL_MAUVE, 0.45),
					new Sphere([0.5, 2.5, 1.25], 1.25, COL_BLACK, 0.3),
					new Sphere([-1.5, -2.5, 0.8], 0.8, COL_ORANGE_ORANGE, 0.25),
					//new Cylinder([-2.5, 4, 0], [0, 0, 1], 1, 1.5, COL_LIME_GREEN, 0.3),
				];
				this.shapes[0].colour = function(p) {
					//let x = Math.floor(p[0]);
					//let y = Math.floor(p[1]);
					//let index = (x & 1) + (y & 1);
								//return [COL_DEEP_PINK, COL_VERY_DARK_GREY, COL_MAUVE][index];
					
					/*let f = p[0] * p[0] + p[1] * p[1];
					let index = 2;
					if ((f >= 2 && f <= 3) || (f >= 11 && f <= 12)) {
						index = 1;
					} else if (f >= 5 && f <= 10) {
						index = 0;
					}
					// */
					
					let f = Math.sin(p[0]) + p[1];
					let index;
					if (f > 0 && f < 1) {
						index = 0;
					} else {
						//index = 1 + (Math.floor(p[0]) & 1) + (Math.floor(p[1]) & 1);
						index = 1 + ((Math.floor(p[0] / 4) + Math.floor(p[1] / 4 )) & 1);
					}
					return [COL_DEEP_PINK, COL_GREY, COL_BLACK, COL_DEEP_BLUE][index];
				}
				this.shapes[6].material = MAT_GLASS;
				this.shapes[8].colour = function(p) {		// 8-ball
					let cosTheta1, cosTheta2;
					cosTheta1 = vecDot(vecMinus(p, this.centre), vecNormalize([-1, -1, 0])) / this.radius;
					if (cosTheta1 < 0.905) {
						return COL_BLACK;
					}
					cosTheta1 = vecDot(vecMinus(p, this.centre), vecNormalize([-1, -1, 0.15])) / this.radius;
					cosTheta2 = vecDot(vecMinus(p, this.centre), vecNormalize([-1, -1, -0.12])) / this.radius;
					if ((cosTheta1 > 0.9920 && cosTheta1 < 0.999) || (cosTheta2 > 0.9900 && cosTheta2 < 0.9980)) {
						return COL_BLACK;
					}
					return COL_WHITE;            
				}

				this.camera = new Camera([-0.3, -4, 1], [0, 1, -0.1], [0, 0, 1], this.canvasWidth, this.canvasHeight);
				break;
			case 1:
				this.shapes = [
					new Plane([0, 0, 0], [0, 0, 1], COL_WHITE, 0.2),
					new Plane([0, 80, 0], [0, -1, 0], COL_SKY_BLUE),
					new Plane([0, -80, 0], [0, 1, 0], COL_VERY_DARK_GREY),
					new Plane([80, 0, 0], [-1, 0, 0], COL_VERY_DARK_GREY),
					new Plane([-80, 0, 0], [1, 0, 0], COL_VERY_DARK_GREY),
					new Plane([0, 0, 80], [1, 0, -1], COL_VERY_DARK_GREY),

					new Sphere([0.3, 0, 0.5], 0.45, COL_RED, 0.50),
					new Sphere([-1.1, 1.2, 0.25], 0.25, COL_MAUVE, 0.45),
					new Sphere([0.5, 7, 1.25], 1.25, COL_BLACK, 0.3),
					new Sphere([-1.5, -2.5, 0.8], 0.8, COL_ORANGE_ORANGE, 0.25),
	
					new Plane([0, 4.25, 0], [0, -1, 0], COL_WHITE, 0.95),
					new Plane([0, 4.35, 0], [0, 1, 0], COL_WHITE, 0.95),
				];
				this.shapes[0].colour = function(p) {
					let f = Math.sin(p[0]) + p[1];
					let index;
					if (f > 0 && f < 1) {
						index = 0;
					} else {
						index = 1 + (Math.floor(p[0] * 2) & 1) + (Math.floor(p[1] * 2) & 1)
					}
					return [COL_DEEP_PINK, COL_GREY, COL_BLACK, COL_DEEP_BLUE][index];
				}
				this.shapes[9].material = MAT_GLASS;
				this.shapes[10].material = MAT_GLASS;
				this.shapes[11].material = MAT_GLASS;
				/*this.shapes[8].colour = function(p) {		// 8-ball
					let cosTheta1, cosTheta2;
					cosTheta1 = vecDot(vecMinus(p, this.centre), vecNormalize([-1, -1, 0])) / this.radius;
					if (cosTheta1 < 0.905) {
						return COL_BLACK;
					}
					cosTheta1 = vecDot(vecMinus(p, this.centre), vecNormalize([-1, -1, 0.15])) / this.radius;
					cosTheta2 = vecDot(vecMinus(p, this.centre), vecNormalize([-1, -1, -0.12])) / this.radius;
					if ((cosTheta1 > 0.9920 && cosTheta1 < 0.999) || (cosTheta2 > 0.9900 && cosTheta2 < 0.9980)) {
						return COL_BLACK;
					}
					return COL_WHITE;            
				}*/

				this.camera = new Camera([-0.3, -6, 3], [0, 1, -0.2], [0, 0, 1], this.canvasWidth, this.canvasHeight);
				break;
			case 2:
				this.shapes = [
					new Plane([0, 0, 0], [0, 0, 1], COL_GREY, 0.6),
					new Plane([0, 12, 0], [0, -1, 0], COL_VERY_DARK_GREY, 0.02),
					new Plane([0, -12, 0], [0, 1, 0], COL_VERY_DARK_GREY, 0.02),
					new Plane([12, 0, 0], [-1, 0, 0], COL_MAUVE, 0.02),
					new Plane([-12, 0, 0], [1, 0, 0], COL_MAUVE, 0.02),
				];
				/* new Ball(this.shapes, [-0.5, 0, 1], 1, COL_RED, 0.3, 0.3);
				new Ball(this.shapes, [3, 2, 4], 4, COL_LIME_GREEN, 0.7, 0.5);
				new Box(this.shapes, [-3, 2, 0], [2, 0, 0], [0, 2, 0], [0, 0, 1.25], COL_DEEP_BLUE, 0.5, 0.05);
				new Prism(this.shapes, [-1.3, -1.5, 0], [1.5, -0.3, 0], [1.5, 0.3, 0], [0, 0, 1.5], COL_WHITE, 0.98, 1, MAT_GLASS);*/
				//new Ball(this.shapes, [1.75, -1, 1.5], 1.5, COL_SILVER, 0.98, 1, MAT_GLASS); 
				
				//new Cuboctahedron(this.shapes, [1.7, 2.2, 0], [1.6, 1.2, 0], [-1.2, 1.6, 0], [0, 0, 2], COL_LIME_GREEN, COL_DEEP_BLUE, 0.3, 0.2, MAT_OPAQUE);
				//new Cuboctahedron(this.shapes, [-1, -2, 0], [1.2, 1.6, 0], [-1.6, 1.2, 0], [0, 0, 2], COL_GRAPEFRUIT_YELLOW, COL_ORANGE_ORANGE, 0.3, 0.2, MAT_OPAQUE);

				this.shapes[0].colour = function(p) {
					let x = Math.abs((p[0] + 100.7) % 2.3 - 1.15);
					let y = Math.abs((p[1] + 102.7) % 2.3 - 1.15);
					let index = 0;
					if (x < 0.03 || y < 0.03 || x + y < 0.6) {
						index = 1;
					}
					//let index = (Math.floor((p[0] + 0.7) / 0.32) + Math.floor((p[1] + 14.2) / 0.32)) & 1;
					return [COL_WHITE, COL_BLACK][index];
				}

				//new Ball(this.shapes, [3, 2, 4], 4, COL_LIME_GREEN, 0.7, 0.5);

				/*for (let x = -5; x < 5; x++) {
					for (let y = -5; y < 5; y++) {
						new Ball(this.shapes, [x, y, 0.4], 0.4, COL_WHITE, 0.98, 1, MAT_GLASS);
					}
				}*/

				new Spotlight(this.shapes, this.lights, [0, -2, 1.5], 1, [0, 0, 1], 40);
				new Spotlight(this.shapes, this.lights, [0, 10, 1.5], 1, [0, -1, 0], 40);

				this.camera = new Camera([-2.8, -9, 2.5], [0.3, 1, -0.12], [0, 0, 1], this.canvasWidth, this.canvasHeight);
				//this.camera = new Camera([0, 0, 10], [0, 0, -1], [0, 1, 0], this.canvasWidth, this.canvasHeight);
				break;
			case 3:
				this.shapes = [
					new Plane([0, 0, 0], [0, 0, 1], COL_GREY, 0.6),
					new Plane([0, 16, 0], [0, -1, 0], COL_VERY_DARK_GREY, 0.02),
					new Plane([0, -16, 0], [0, 1, 0], COL_VERY_DARK_GREY, 0.02),
					new Plane([16, 0, 0], [-1, 0, 0], COL_DARK_GREY, 0.02),
					new Plane([-16, 0, 0], [1, 0, 0], COL_DARK_GREY, 0.02),

/*					new Sphere([4, 2, 3], 3, COL_COPPER, 0.2),

					new Sphere([-2.5, -1.2, 0.6], 0.6, COL_SILVER, 0.98, MAT_GLASS),
					new Sphere([-2.5, -1.2, 0.6], 0.05, COL_SILVER, 0.98, MAT_AIR),

					new Sphere([-1, -1.2, 0.6], 0.6, COL_SILVER, 0.98, MAT_GLASS),
					new Sphere([-1, -1.2, 0.6], 0.3, COL_SILVER, 0.98, MAT_AIR),

					new Sphere([0.5, -1.2, 0.6], 0.6, COL_SILVER, 0.98, MAT_GLASS),
					new Sphere([0.5, -1.2, 0.6], 0.55, COL_SILVER, 0.98, MAT_AIR),*/
				];
				/*new Bowl(this.shapes, [0, -1, 1], 1, 0.9, [0, 0, 1], COL_WHITE, 0.97, MAT_GLASS);*/
				new Halfball(this.shapes, [0, -1, 1], 0.9, [0, 0, 1], 0.3, undefined, COL_WHITE, 0.97, MAT_WATER);/*
				new Box(this.shapes, [-0.1, -1, 0.15], [0.1, 0, 0], [0, 0.1, 0], [0.5, 0, 1.8], COL_COPPER, 0.1);
				new Cuboctahedron(this.shapes, [-0.7, 1, 0], [1.2, 0, 0], [0, 1.2, 0], [0, 0, 1.2], COL_DEEP_BLUE, COL_DEEP_PINK, 0.3)*/
				new Bowl(this.shapes, [-2.3, 1, 1], 1, 0.8, [0, 0, 1], COL_DEEP_BLUE, 0.3);
				new Ball(this.shapes, [-2.3, 1, 0.7], 0.5, COL_GRAPEFRUIT_YELLOW, 0.3);
				new Ball(this.shapes, [0.35, -0.8, 2.8], 0.3, COL_ORANGE_ORANGE, 0.3);
				new Ball(this.shapes, [-0.4, 3.5, 2], 2, COL_COPPER, 0.6);
				new Cuboctahedron(this.shapes, [-0.7, -2, 0], [2.5, 0, 0], [0, 2.5, 0], [0, 0, 2.5], COL_DEEP_PINK, COL_DARK_GREY, 0.3);

				//new Box(this.shapes, [-2, 0.5, 0], [1, 0, 0], [0, 4.5, 0], [0, 0, 1.3], COL_MAUVE, 0.1, MAT_OPAQUE);
				//new Prism(this.shapes, [0, 2, 0], [1, 0, 0], [0, 4, 0], [0, 0, 0.5], COL_LIME_GREEN, 0.8, MAT_GLASS);
				//new Prism(this.shapes, [-0.5, 2.5, 0.5], [0, -0.75, 0], [1.5, 0, 0], [0, 0, 1.25], COL_YELLOW, 0.8, MAT_GLASS);

				this.shapes[0].colour = function(p) {				
					let index = ((Math.floor((0.6 * p[0] + 0.8 * p[1] + 0.7) / 3.2) + Math.floor((0.8 * p[0] - 0.6 * p[1] + 0.2) / 3.2)) & 1);
					return [COL_WHITE, COL_BLACK][index];
				}

				this.camera = new Camera([-3.3, -8, 4.5], [0.4, 1, -0.4], [0, 0, 1], this.canvasWidth, this.canvasHeight);
			default:
				break;
		}
		this.initLights();
	}

	initLights() {
		let totalIntensity = 0;
		for (let l of lights) {
			// for now, assuming all lights are discs
			l.intensity = l.wattage * Math.PI * l.radius ** 2;
			totalIntensity += l.intensity;
		}
		for (let l of lights) {
			l.prob = l.intensity / totalIntensity;	// probability of being chosen as random light source
		}
	}

	projectToCanvas(xyz) {
		let uvw = this.camera.toUVW(xyz);
		if (uvw[2] >= 0) {
			return undefined;
		}
		// project onto plane w = -1
		let u = -uvw[0] / uvw[2];
		let v = -uvw[1] / uvw[2];
		u /= this.camera.fovScaleWidth;
		v /= this.camera.fovScaleHeight;

		return { x: (u + 1) * this.canvasWidth / 2 - 1, y: (-v + 1) * this.canvasHeight / 2 - 1 };
	}
    
	traceTile(tile, tileSize) {
		let x, y;
		for (y = 0; y < tileSize; y++) {
			for (x = 0; x < tileSize; x++) {
				this.traceOnCanvas(tile[0] + x, tile[1] + y, MAX_TRACE_DIST, MAX_DEPTH);
			}
		}
	}

	traceOnCanvas(canvasX, canvasY, maxDist, maxDepth) {
		maxDist = maxDist || MAX_TRACE_DIST;
		if (maxDepth == undefined) {
			maxDepth = MAX_DEPTH;
		}

		if (debug) {
			console.log('FIRE THE LASERS');
		}

		let u, v, w, xyz;
		let ray, rayCol;
		let totalCol = { r: 0, g: 0, b: 0, a: 0 }
		for (let subSampleY = 0; subSampleY < SUB_SAMPLE; subSampleY++) {
			for (let subSampleX = 0; subSampleX < SUB_SAMPLE; subSampleX++) {
				u = ((canvasX + (subSampleX + Math.random()) / SUB_SAMPLE) * 2 / this.canvasWidth) - 1;
				v = -(((canvasY + (subSampleY + Math.random()) / SUB_SAMPLE) * 2 / this.canvasHeight) - 1);
				w = -1;

				u *= this.camera.fovScaleWidth;
				v *= this.camera.fovScaleHeight;

				xyz = this.camera.toXYZ([u, v, w]);
				let origin = this.camera.origin;                
        // simulate lens: very slow, since subsampling needs to be high enough to avoid graininess
				/*let lensSample = discSample(0.0025);
				let origin = this.camera.toXYZ([lensSample.x, lensSample.y, 0));*/
				ray = new Ray(origin, vecMinus(xyz, origin));
				rayCol = colour(this.traceRay(ray, maxDist, maxDepth, 1, [MAT_AIR]));	// wrap it in colour function to prevent overwriting named colours

				totalCol.r += rayCol.r;
				totalCol.g += rayCol.g;
				totalCol.b += rayCol.b;
				totalCol.a += rayCol.a;
			}
		}
		rayCol.r = Math.floor(totalCol.r / (SUB_SAMPLE * SUB_SAMPLE));
		rayCol.g = Math.floor(totalCol.g / (SUB_SAMPLE * SUB_SAMPLE));
		rayCol.b = Math.floor(totalCol.b / (SUB_SAMPLE * SUB_SAMPLE));
		rayCol.a = Math.floor(totalCol.a / (SUB_SAMPLE * SUB_SAMPLE));
		putPixel(this.ctx, rayCol, canvasX, canvasY);
	}

	traceRay(ray, maxDist, depth, importance, material_stack) {
		if (importance < 0.01) {
			return COL_WHITE;
		}

		if (debug) {
			let laserStart = this.projectToCanvas(ray.origin);

			this.ctx.beginPath();
			this.ctx.lineWidth = 1;
			this.ctx.strokeStyle = "white";
			if (laserStart != undefined) {
				this.ctx.moveTo(laserStart.x, laserStart.y);
			}
		}

		let minIntersectionDist = Infinity;
		let minShape;
		//for (let s = 0, len = this.shapes.length; s < len; s++) {
		for (let s = this.shapes.length; s--; ) {
			let t = ray.intersectDist(this.shapes[s]);
			if (debug) {
				console.log(`  calc intersection with shape ${s}: ${t}`);
			}

			if (t > EPSILON && t < minIntersectionDist) {
				minIntersectionDist = t;
				minShape = s;
			}
		}
		if (minIntersectionDist < Infinity) {
			let intersection = vecPlus(ray.origin, vecScalar(minIntersectionDist, ray.dir));
			let shapeCol = this.shapes[minShape].colour(intersection);
			let normal = this.shapes[minShape].normal(intersection);

			if (debug) {
				console.log(`hitting shape ${minShape}, a ${this.shapes[minShape].type} with reflectance ${this.shapes[minShape].reflectance}`);
				console.log(`  material stack: ${material_stack}`)
				let laserEnd = this.projectToCanvas(intersection);
				if (laserEnd != undefined && ray.origin != this.camera.origin) {
					this.ctx.lineTo(laserEnd.x, laserEnd.y);
					this.ctx.stroke();
				}
			}

			let rayCol = { r: 0, g: 0, b: 0, a: 1 };

			let transmittedColour = shapeCol;
			//if (minIntersectionDist < maxDist || depth > 0) {	// hit something: reflect or refract
			if (minIntersectionDist < maxDist && depth > 0) {	// hit something: reflect or refract
				let cosTheta1	= -vecDot(ray.dir, normal);
				if (this.shapes[minShape].material == MAT_OPAQUE) {
					if (cosTheta1 < 0) {
						console.log(`Inside an opaque object #${minShape}, a ${this.shapes[minShape].type}? at ${intersection}; material stack is ${material_stack}`);
						console.log(`  coming from ${ray.origin}, direction ${ray.dir}`);
						console.log(`  hit object ${minShape}, a ${this.shapes[minShape].type}`);
						let proj = this.projectToCanvas(intersection);
						this.ctx.strokeStyle = "red";
						this.ctx.beginPath();
						this.ctx.arc(proj.x, proj.y, 10, 0, 2 * Math.PI);
						this.ctx.stroke();
						return (minIntersectionDist < 1e5) ? undefined : COL_BLACK;	// if it's far away, probably doesn't matter
						//return undefined;
					} else {
						let reflectDir = vecPlus(ray.dir, vecScalar(2 * cosTheta1, normal));
						let perturbDir = reflectDir;
						if (Math.random() > this.shapes[minShape].specular) {		// for Lambertian reflectance, perturb the vector
							for(let attempt = 0; attempt < 100; attempt++) {
								perturbDir = vecPerturb(reflectDir);//, 0.01); //0.2);
								if (vecDot(perturbDir, normal) > EPSILON) {
									break;
								}
								if (attempt > 10) {
									console.log(":O")
								}
								if (attempt == 99) {
									perturbDir = reflectDir;
								}
							}
						}
						transmittedColour = this.traceRay(new Ray(intersection, perturbDir), maxDist - minIntersectionDist, depth - 1, importance * this.shapes[minShape].reflectance, material_stack);
					}					
				} else {
					let eta1 = matRefrIndex[material_stack[material_stack.length - 1]];		// current medium
					let eta2 = (vecDot(ray.dir, normal) < 0) ? matRefrIndex[this.shapes[minShape].material] : matRefrIndex[material_stack[material_stack.length - 2]];	// enter or exit medium
					if (eta2 == undefined) {
						//throw new Error("exited all materials: check consistency of objects")
					}
					let etaRatio = eta1 / eta2;					
					let cosTheta2Sq = 1 - etaRatio * etaRatio * (1 - cosTheta1 * cosTheta1);
					if (debug) {
						console.log(`eta ratio: ${etaRatio}`)
					}
					if (cosTheta2Sq < 0) {	// total internal reflection
						if (debug) {
							console.log(`total internal reflection`);
						}
						let reflectDir = vecPlus(ray.dir, vecScalar(2 * cosTheta1, normal));
						transmittedColour = this.traceRay(new Ray(intersection, reflectDir), maxDist - minIntersectionDist, depth - 1, importance * this.shapes[minShape].reflectance, material_stack);
					} else {
						let plusMinus = (cosTheta1 < 0) ? -1 : 1;		// used in refractDir to make sure angle is right depending on whether we're entering or exiting (because normal points out of surface)
						let refractDir = vecPlus(vecScalar(etaRatio, ray.dir), vecScalar(etaRatio * cosTheta1 - plusMinus * Math.sqrt(cosTheta2Sq), normal));
						if (debug) {
							console.log(`refraction. MS is ${material_stack}`);
						}
						if (cosTheta1 < 0) {	// exiting medium
							material_stack.pop();
							if (debug) {
								console.log(`exiting medium; now MS is ${material_stack}`);
							}
						} else {		// entering medium
							material_stack = [...material_stack, this.shapes[minShape].material];
							if (debug) {
								console.log(`entering medium; now MS is ${material_stack}`);
							}
						}
						if (debug) {
							console.log(`refract at ${intersection}`);
							console.log(`    in dir ${refractDir}`);
						}
						//let reflectDir = vecPlus(ray.dir, vecScalar(2 * cosTheta1, normal));
						let reflectance = 0.0;
						let reflectedColour = COL_WHITE;
						
						let refractedColour = this.traceRay(new Ray(intersection, refractDir), maxDist - minIntersectionDist, depth - 1, (1 - reflectance) * importance * this.shapes[minShape].reflectance, material_stack);
						
						for (let component of ["r", "g", "b"]) {
							//transmittedColour[component] = Math.round(reflectance * reflectedColour[component] + (1 - reflectance) * refractedColour[component]);
							//transmittedColour[component] = 255; // refractedColour[component];
						}
						transmittedColour = refractedColour;
					}
				}
			}

			for (let component of ["r", "g", "b"]) {
				rayCol[component] = Math.round((1 - this.shapes[minShape].reflectance) * shapeCol[component] + this.shapes[minShape].reflectance * transmittedColour[component]);
				if (rayCol[component] < 0) {
					rayCol[component] = 0;
				} else if (rayCol[component] > 255) {
					rayCol[component] = 255;
				}
			}
			return rayCol;
		}
		if (debug) {
			console.log(`nothing there (ray at ${ray.origin} in direction ${ray.dir})`);
		}
		return COL_VERY_DARK_GREY;
	}
}

function qRoots(a, halfB, c) {
	if (a == 0) {
		if (halfB == 0) {
			return undefined;	// if c == 0 also, then all x is a solution
		}
		return -c / (2 * halfB);
	}

	let discriminant = halfB * halfB - a * c;
	if (discriminant < 0) {
		return undefined;
	}

	discriminant = Math.sqrt(discriminant);
	return [(-halfB - discriminant) / a, (-halfB + discriminant) / a];
}

function getPixel(ctx, x, y) {
	let pixelData = ctx.getImageData(x, y, 1, 1).data
	return {
		r: pixelData[0],
		g: pixelData[1],
		b: pixelData[2],
		a: pixelData[3]
	}
}

function splat(ctx, colour, x, y, size) {
	if (size == undefined) {
		let gotSize = false;
		for (size = 0; size < 100 && !gotSize; size++) {
			for (let i = 0; i < 10; i++) {
				let theta = Math.PI / 180 * Math.random();
				let neighbourX = x + Math.round((size + 1) * Math.cos(theta));
				let neighbourY = y + Math.round((size + 1) * Math.sin(theta));
				let neighbourCol = getPixel(ctx, neighbourX, neighbourY);
				if (neighbourCol.r || neighbourCol.g || neighbourCol.b || neighbourX > ctx.width || neighbourY > ctx.height) {
					gotSize = true;
				}
			}
		}
	}

	if (size == 1) {
		return putPixel(ctx, colour, x, y);
	}

	ctx.beginPath();
	ctx.arc(x, y, size, 0, 2 * Math.PI);
	ctx.fillStyle = "rgba(" + colour.r + "," + colour.g + "," + colour.b + "," + colour.a + ")";
	ctx.fill();
}

function putPixel(ctx, colour, x, y) {
	/*if (Math.random() < 0.25) {
		ctx.fillStyle = "rgba(" + colour.r + "," + colour.g + "," + colour.b + "," + 0.125 * colour.a + ")";
		ctx.fillRect(x - 10, y - 10, 21, 21);
	}*/

	ctx.fillStyle = "rgba(" + colour.r + "," + colour.g + "," + colour.b + "," + colour.a + ")";
	ctx.fillRect(x, y, 1, 1);
}

function discSample(radius) {
	let r = Math.sqrt(Math.random()) * radius;
	let theta = 2 * Math.PI * Math.random();
	return { x: r * Math.cos(theta), y: r * Math.sin(theta) };
}

function getMousePos(canvas, evt) {
	let rect = canvas.getBoundingClientRect();
	return {
		x: evt.clientX - rect.left,
		y: evt.clientY - rect.top
	};
}

function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// =================================================================================================

function main() {
	let canvas = document.getElementById('canvas');
	let ctx = canvas.getContext('2d');
	ctx.height = canvas.height;
	ctx.width = canvas.width;

	canvas.addEventListener('mousemove', function(evt) {
		//return;
		let mousePos = getMousePos(canvas, evt);
        
		let radius = 50 / SUB_SAMPLE;
		for (let y = -radius; y <= radius; y++) {
			for (let x = -radius; x <= radius; x++) {
				if (x * x + y * y <= radius * radius) {
					scene.traceOnCanvas(mousePos.x - x, mousePos.y - y, MAX_TRACE_DIST, MAX_DEPTH);
				}
			}
		}
	}, false);

	canvas.addEventListener('click', function(evt) {
		debug = true;
		let mousePos = getMousePos(canvas, evt);

		/*for (let z = 0; z < 3; z ++) {
			let ray = new Ray([0, 0, z], [0, 1, 0]);
			console.log(z, ray.intersectDist(scene.shapes[1]));
		}*/

		scene.traceOnCanvas(mousePos.x, mousePos.y, MAX_TRACE_DIST, MAX_DEPTH)
		debug = false;
		
		/*let x, y, z, proj;
		//for (let s = 0, len = this.shapes.length; s < len; s++) {
		for (let s = this.shapes.length; s--; ) {
			if (scene.shapes[s].type == 'sphere') {
				for (let theta = 0; theta < 360; theta += 1) {
					x = scene.shapes[s].centre[0] + scene.shapes[s].radius * Math.cos(Math.PI / 180 * theta);
					y = scene.shapes[s].centre[1] + scene.shapes[s].radius * Math.sin(Math.PI / 180 * theta);
					z = scene.shapes[s].centre[2];
					proj = scene.projectToCanvas([x, y, z));
					putPixel(ctx, COL_WHITE, proj.x, proj.y);

					x = scene.shapes[s].centre[0];
					y = scene.shapes[s].centre[1] + scene.shapes[s].radius * Math.cos(Math.PI / 180 * theta);
					z = scene.shapes[s].centre[2] + scene.shapes[s].radius * Math.sin(Math.PI / 180 * theta);;
					proj = scene.projectToCanvas([x, y, z));
					putPixel(ctx, COL_LIME_GREEN, proj.x, proj.y);

					x = scene.shapes[s].centre[0] + scene.shapes[s].radius * Math.cos(Math.PI / 180 * theta);
					y = scene.shapes[s].centre[1];
					z = scene.shapes[s].centre[2] + scene.shapes[s].radius * Math.sin(Math.PI / 180 * theta);;
					proj = scene.projectToCanvas([x, y, z));
					putPixel(ctx, COL_RED, proj.x, proj.y);
				}	
			}
		}*/
	}, false);
    
 	let scene = new Scene(ctx);
	scene.loadPreset(2);
	//return;

	/*for (let i = 0; i < 1000; i++) {
		setTimeout(function() { scene.traceScene() }, 100);
	}*/
	//let trace = setInterval(function() { scene.traceRandom() }, 10);
    
	let now = Date.now();
	
	let tiles = [];
	let tileSize = Math.floor(200 / SUB_SAMPLE);
	for (let y = 0; y < canvas.height / tileSize; y++) {
		for (let x = 0; x < canvas.width / tileSize; x++) {
			tiles.push([x * tileSize, y * tileSize]);
		}
	}
	tiles = shuffle(tiles);

	//return;

	let trace = setInterval(function() {
		if (tiles.length) {
			let tile = tiles.pop();
			scene.traceTile(tile, tileSize);
		} else {
			clearInterval(trace);
		}        
	}, 10);
}