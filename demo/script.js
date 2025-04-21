const glCanvas = document.getElementById("glCanvas");
const uiCanvas = document.getElementById("canvas");

glCanvas.width = window.innerWidth;
glCanvas.height = window.innerHeight;
uiCanvas.width = window.innerWidth;
uiCanvas.height = window.innerHeight;

const gl = glCanvas.getContext("webgl", {preserveDrawingBuffer: true});
if (!gl) {
    alert("WebGL not supported on this browser.");
}
const ctx = uiCanvas.getContext("2d");

gl.viewport(0, 0, glCanvas.width, glCanvas.height);

const vertexShaderSource = `
attribute vec2 a_position;
attribute float a_pointSize;
attribute vec3 a_color;
uniform vec2 u_resolution;
varying vec3 v_color;
void main() {
    vec2 zeroToOne = a_position / u_resolution;
    vec2 zeroToTwo = zeroToOne * 2.0;
    vec2 clipSpace = zeroToTwo - 1.0;
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
    gl_PointSize = a_pointSize;
    v_color = a_color;
}`;

const fragmentShaderSource = `
precision mediump float;
varying vec3 v_color;

void main() {
    float dist = distance(gl_PointCoord, vec2(0.5, 0.5));
    
    if (dist > 0.5) {
        discard;
    }
    
    float intensity = 1.2 - pow(dist * 2.0, 1.5);
    
    vec3 innerColor = mix(vec3(1.0, 1.0, 1.0), v_color, smoothstep(0.0, 0.2, dist));
    
    vec3 finalColor = innerColor * intensity;
    
    float alpha = 1.0 - pow(dist * 2.0, 2.0);
    
    gl_FragColor = vec4(finalColor, alpha);
}`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shader compilation error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Program linking error:", gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    return program;
}

gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
const program = createProgram(gl, vertexShader, fragmentShader);
gl.useProgram(program);

const bodyBuffer = gl.createBuffer();

window.addEventListener('resize', () => {
  // work in-progress
  window.location.reload();
});

const colorPicker = document.getElementById("colorPicker");
const rainbowMode = document.getElementById("rainbowMode");

const Tools = {
  BRUSH_MENU: "brush-menu",
  BRUSH: "brush",
  SCREENSHOT: "screenshot",
  RECORD: "record",
};

const Hover = {
  NONE: -1,
  BRUSH: 0,
  PLAY_PAUSE: 1,
  SCREENSHOT: 2,
  RECORD: 3,
};

const Algorithms = {
  N_SQUARED: "N_SQUARED",
  KD: "KD",
}

const G = 0.1;
const numBodies = 300;
const orbitRadius = glCanvas.width / 4;

let tool = Tools.BRUSH;
let hover = Hover.NONE;
let algorithm = Algorithms.KD;
let isDragging = false;
let lastBrushX = null;
let lastBrushY = null;
let paused = false;

const colors = [
  "#FF0000", // Red
  "#00FF00", // Green
  "#0000FF", // Blue
  "#FFFF00", // Yellow
  "#00FFFF", // Cyan
  "#FF00FF", // Magenta
  "#FFFFFF", // White
  "#FFA500", // Orange
  "#FFC0CB", // Pink
  "#800080", // Purple
  "#ADD8E6", // Light Blue
  "#006400", // Dark Green
  "#FFD700", // Gold
  "#C0C0C0", // Silver
  "#F5F5DC", // Beige
  "#800000", // Maroon
  "#008080", // Teal
  "#000080"  // Navy
];

class Brush {
  static BrushType = {
    POINT: "point",
    SCATTER: "scatter",
  };

    constructor() {
        this.size = {value: 5};
        this.spread = {value: 30};
        this.count = {value: 10};
        this.density = {value: 1};
        this.style = Brush.BrushType.POINT;
        this.density_counter = 0;
        this.max_density = 100;
        this.color = "#0000ff";
        this.rainbowMode = false;
    }

    density_count() {
        this.density_counter = (this.density_counter + this.density.value) % this.max_density;
        return this.density_counter < this.density.value;
    }

  reset_density_counter() {
    this.density_counter = 0;
  }
  getColor() {
    if (!this.rainbowMode) return this.color;
    return this.generateColor();
  }

  generateColor() {
    return colors[Math.floor(Math.random()*colors.length)];
  }
}

class Icon {
  constructor(size, src) {
    this.size = size;
    this.image = new Image(this.size, this.size);
    this.image.src = src;
  }
}

class Menu {
  constructor() {
    this.width = uiCanvas.width * 0.2;
    this.x = uiCanvas.width - this.width - 20;
    this.y = 20;
    this.paint_brush_icon = new Icon(this.width, "./assets/paint-brush-icon.png");
    this.play_pause_icon = new Icon(this.width, "./assets/pause-icon.png");
    this.screenshot_icon = new Icon(this.width, "./assets/screenshot-icon.png");
    this.record_icon = new Icon(this.width, "./assets/record-icon.png");  
    this.icons = [this.paint_brush_icon, this.play_pause_icon, this.screenshot_icon, this.record_icon];
    this.height = this.width / this.icons.length + 15;
    this.icon_size = (this.width - 20) / this.icons.length;
  }

  draw() {
    const x_padding = 10;
    const y_padding = 10;
    let x_offset = 0;

    ctx.fillStyle = 'rgba(128, 128, 128, 0.5)';
    ctx.fillRect(this.x, this.y, this.width, this.height);

    for (const icon of this.icons) {
      ctx.drawImage(icon.image, this.x + x_padding + x_offset, this.y + y_padding, this.icon_size, this.icon_size);
      x_offset += this.icon_size;
    }

    if (hover != -1) {
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.x + x_padding + this.icon_size * hover, this.y + y_padding, this.icon_size, this.icon_size);
    }
  }

  checkBounds(x,y) {
    return x >= this.x && x <= this.x + this.width && y >= this.y && y <= this.y + this.height;
  }
}

class BrushSubMenu {
    constructor(parentMenu, brush) {
        this.parentMenu = parentMenu;
        this.width = parentMenu.width;
        this.height = parentMenu.height * 5; // Increased height to accommodate slider
        this.x = parentMenu.x;
        this.y = parentMenu.y + parentMenu.height;
        this.options = ["Point", "Scatter"];
        this.density_slider = new Slider("density", this.x + 10, this.y + this.height * .2, this.width - 20, brush.density);
        this.size_slider = new Slider("size", this.x + 10, this.y + this.height * .4, this.width - 20, brush.size);
        this.spread_slider = new Slider("spread", this.x + 10, this.y + this.height * .6, this.width - 20, brush.spread);
        this.count_slider = new Slider("count", this.x + 10, this.y + this.height *.8, this.width - 20, brush.count);
        this.size = {value: 5};
        this.spread = {value: 30};
        this.count = {value: 10};
        this.density = {value: 1};
        this.sliders = [this.density_slider,
                        this.size_slider,
                        this.spread_slider,
                        this.count_slider
        ];
    }

    draw() {
        if (tool === Tools.BRUSH_MENU) {
            ctx.fillStyle = 'rgba(128, 128, 128, 0.8)';
            ctx.fillRect(this.x, this.y, this.width, this.height);
            const optionHeight = this.height * .1 // Adjusted for slider space
            
            for (let i = 0; i < this.options.length; i++) {
                const optionX = this.x + i * this.width / 2;

                if (brush.style === this.options[i].toLowerCase()) {
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(optionX, this.y, this.width / 2, optionHeight);
                }

                ctx.fillStyle = 'white';
                ctx.font = '16px Arial';
                ctx.fillText(this.options[i], 10 + optionX, this.y + optionHeight / 2);
            }

            const colorPickerX = this.x + 10;
            const colorPickerY = this.y + this.height * 0.9;
            const rainbowModeX = this.x + this.width*.75;
            const rainbowModeY = colorPickerY;

            colorPicker.style.display = "block";
            colorPicker.style.left = `${colorPickerX}px`;
            colorPicker.style.top = `${colorPickerY}px`;

            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.font = '16px Arial';
            ctx.fillText("rainbow mode", rainbowModeX-105, rainbowModeY+17);
            rainbowMode.style.display = "block";
            rainbowMode.style.left = `${rainbowModeX}px`;
            rainbowMode.style.top = `${rainbowModeY}px`;

            for (const slider of this.sliders) {
                slider.draw();
            }
        } else {
          colorPicker.style.display = "none";
          rainbowMode.style.display = "none";
        }
    }

    handleMouseDown(x, y) {
      if (this.checkBounds(x,y)) {
        for (const slider of this.sliders) {
            slider.handleMouseDown(x, y);
        }
        return true;
      }
      return false;
    }

    handleMouseMove(x, y) {
        if (this.checkBounds(x,y)) {
          for (const slider of this.sliders) {
              slider.handleMouseMove(x, y);
          }
          return true;
        }
        return false;
    }

    handleMouseUp() {
        for (const slider of this.sliders) {
            slider.handleMouseUp();
        }
    }

    checkBounds(x,y) {
      return tool == Tools.BRUSH_MENU && x >= this.x && x <= this.x + this.width && y >= this.y && y <= this.y + this.height;
    }
}

class Diagnostics {
  constructor(x,y,width) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.avg_compute_time = {
      value : null,
    }
    this.particle_count = {
      value: null,
    }
    this.performance_history_size = 10;
    this.performance_history = Array(this.performance_history_size).fill(null);
    this.frame_counter = 0;


    this.diagnostics = [
      new Diagnostic(this.x, this.y, "Time / Frame (ms)", this.avg_compute_time, 3),
      new Diagnostic(this.x, this.y+15, "# Particles", this.particle_count),
    ]
  }

  update_time(compute_time) {
    this.performance_history[this.frame_counter%this.performance_history_size] = compute_time;
    this.frame_counter++;
    if (this.frame_counter % this.performance_history_size == 0) this.recompute_avg_time(compute_time);
  }

  update_particle_count(particle_count) {
    this.particle_count.value = particle_count;
  }

  recompute_avg_time() {
    this.avg_compute_time.value = this.performance_history.reduce((a,b) => a + b, 0) / this.performance_history_size;
  }


  draw() {
    ctx.clearRect(this.x, this.y, this.width, this.diagnostics.length*20);
    
    for (const diagnostic of this.diagnostics) {
      diagnostic.draw();
    }
  }
}

class Diagnostic {
  constructor(x,y,label, value_ref, num_decimals = 0) {
    this.x = x;
    this.y = y;
    this.label = label;
    this.value_ref = value_ref;
    this.num_decimals = num_decimals;
  }
  draw() {
    ctx.font = '12px Arial';
    ctx.fillStyle = 'white';
    ctx.fillText(`${this.label}: ${this.value_ref.value != null ? this.value_ref.value.toFixed(this.num_decimals) : "null"}`, this.x, this.y);
  }
}

class Slider {
    constructor(label,x,y,width,value_ref) {
        this.label = label;
        this.x = x,
        this.y = y;
        this.width = width,
        this.height = 10,
        this.handle_radius = 8,
        this.min_value = 1;
        this.max_value = 100;
        this.value_ref = value_ref;
        this.dragging = false
    }

    draw() {
        ctx.fillStyle = 'white';
        ctx.fillRect(this.x, this.y, this.width, this.height);

        const handleX = this.x + ((this.value_ref.value - this.min_value) / (this.max_value - this.min_value)) * this.width;
        ctx.beginPath();
        ctx.arc(handleX, this.y + this.height / 2, this.handle_radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillText(`${this.label}: ${this.value_ref.value}`, this.x, this.y - 10);
    }

    handleMouseDown(x, y) {
        const handleX = this.x + ((this.value_ref.value - this.min_value) / (this.max_value - this.min_value)) * this.width;
        const handleY = this.y + this.height / 2;

        const dist = Math.sqrt((x - handleX) ** 2 + (y - handleY) ** 2);
        if (dist <= this.handle_radius) {
            this.dragging = true;
        }
    }

    handleMouseMove(x, y) {
        if (this.dragging) {
            const clampedX = Math.max(this.x, Math.min(x, this.x + this.width));
            this.value_ref.value = Math.round(this.min_value + ((clampedX - this.x) / this.width) * (this.max_value - this.min_value));
        }
    }

    handleMouseUp() {
        this.dragging = false;
    }
}

class Body {
  constructor(x, y, color, mass = Math.random() * 10 + 1, vx = 0, vy = 0, isSun = false) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.mass = mass;
    this.vx = vx;
    this.vy = vy;
    this.radius = Math.cbrt(this.mass);
    this.isSun = isSun;
  }

  compute_n_squared(bodies) {
    if (this.isSun || paused) return;

    let ax = 0, ay = 0;
    for (let body of bodies) {
      if (body !== this) {
        let dx = body.x - this.x;
        let dy = body.y - this.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        let force = (G * this.mass * body.mass) / (dist * dist + 0.1);
        let acc = force / this.mass;
        ax += (dx / dist) * acc;
        ay += (dy / dist) * acc;
      }
    }
    this.vx += ax;
    this.vy += ay;
    this.x += this.vx;
    this.y += this.vy;
  }
}

function updateBodyBuffers() {
    const data = [];
    for (let body of bodies) {
        let r = 0, g = 0, b = 0;
        if (body.color === 'blue') {
            r = 0; g = 0; b = 1;
        } else if (body.color === 'yellow') {
            r = 1; g = 1; b = 0;
        } else if (body.color.startsWith('#')) {
            const hex = body.color.substring(1);
            r = parseInt(hex.substring(0, 2), 16) / 255;
            g = parseInt(hex.substring(2, 4), 16) / 255;
            b = parseInt(hex.substring(4, 6), 16) / 255;
        }
        const sizeMultiplier = body.isSun ? 2.5 : 3.5;
        data.push(body.x, body.y, body.radius * sizeMultiplier, r, g, b);
    }
    return new Float32Array(data);
}

const bodies = [];
const menu = new Menu();
const brush = new Brush();
const submenu = new BrushSubMenu(menu, brush);
const diagnostics = new Diagnostics(100, 50, 200);
const sun = new Body(glCanvas.width / 2, glCanvas.height / 2, 'yellow', 1000, 0, 0, true);
bodies.push(sun);

for (let i = 0; i < numBodies; i++) {
  let angle = (i / numBodies) * Math.PI * 2;
  let distance = orbitRadius;
  let speed = Math.sqrt(G * sun.mass / distance);

  let x = sun.x + Math.cos(angle) * distance;
  let y = sun.y + Math.sin(angle) * distance;

  let vx = -Math.sin(angle) * speed;
  let vy = Math.cos(angle) * speed;

  bodies.push(new Body(x, y, 'blue', Math.random() * 30 + 1, vx, vy));
}

let lastTime = null;
const tickRate = 60;
const tickInterval = 1000 / tickRate;

class KDNode {
  constructor(body, depth = 0, left = null, right = null) {
    this.body = body;
    this.depth = depth;
    this.left = left;
    this.right = right;
  }
}

class KDTree {
  constructor(bodies) {
    this.root = this.build(bodies, 0);
  }

  build(bodies, depth) {
    if (bodies.length === 0) return null;

    const axis = depth % 2;
    const key = axis === 0 ? 'x' : 'y';

    bodies.sort((a, b) => a[key] - b[key]);
    const median = Math.floor(bodies.length / 2);

    return new KDNode(
      bodies[median],
      depth,
      this.build(bodies.slice(0, median), depth + 1),
      this.build(bodies.slice(median + 1), depth + 1)
    );
  }

  computeForces(body, node) {
    if (!node || body === node.body) return { ax: 0, ay: 0 };

    const dx = node.body.x - body.x;
    const dy = node.body.y - body.y;
    const distSq = dx * dx + dy * dy + 0.1;
    const dist = Math.sqrt(distSq);
    const force = (G * body.mass * node.body.mass) / distSq;
    const acc = force / body.mass;

    let ax = (dx / dist) * acc;
    let ay = (dy / dist) * acc;

    const axis = node.depth % 2;
    const key = axis === 0 ? 'x' : 'y';

    if (body[key] < node.body[key]) {
      const leftForce = this.computeForces(body, node.left);
      ax += leftForce.ax;
      ay += leftForce.ay;
    } else {
      const rightForce = this.computeForces(body, node.right);
      ax += rightForce.ax;
      ay += rightForce.ay;
    }

    return { ax, ay };
  }
}

function kd_compute() {
  const tree = new KDTree(bodies);

  for (let body of bodies) {
    if (body.isSun || paused) continue;
    const { ax, ay } = tree.computeForces(body, tree.root);
    body.vx += ax;
    body.vy += ay;
    body.x += body.vx;
    body.y += body.vy;
  }
}

function compute_frame() {
  let start = performance.now();
  switch(algorithm) {
    case Algorithms.N_SQUARED:
      n_squared();
      break;
    case Algorithms.KD:
      // Implement KD algorithm logic here
      // Justin: I also heard barnes hut is good for 2D
      kd_compute();
      break;
    default:
      console.error("Unknown algorithm");
      break;
  }
  const compute_time = performance.now() - start;
  diagnostics.update_time(compute_time);

  // delete particles that go out of bounds
  // this makes computing far more efficient

  const padding = 200;
  bodies.splice(0, bodies.length, ...bodies.filter(
    b => b.isSun || (
      b.x >= -padding && b.x <= canvas.width + padding &&
      b.y >= -padding && b.y <= canvas.height + padding
    )
  ));
}

function n_squared() {
  for (let body of bodies) {
    body.compute_n_squared(bodies);
  }
}

function fadeTrailsProgram() {
  // Only create this once
  if (!window.fadeProgram) {
    const vertexShaderSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    const fragmentShaderSource = `
      precision mediump float;
      uniform vec4 color;
      void main() {
        gl_FragColor = color;
      }
    `;

    const vShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    const program = createProgram(gl, vShader, fShader);
    
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1, 1, 1
    ]), gl.STATIC_DRAW);

    window.fadeProgram = {
      program: program,
      buffer: buffer,
      posLoc: gl.getAttribLocation(program, "position"),
      colorLoc: gl.getUniformLocation(program, "color")
    };
  }

  gl.useProgram(window.fadeProgram.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, window.fadeProgram.buffer);
  gl.enableVertexAttribArray(window.fadeProgram.posLoc);
  gl.vertexAttribPointer(window.fadeProgram.posLoc, 2, gl.FLOAT, false, 0, 0);
  gl.uniform4f(window.fadeProgram.colorLoc, 0, 0, 0, 0.2);
  
  return window.fadeProgram.program;
}

function animate(timestamp) {
    if (!lastTime) {
      lastTime = timestamp;
    }
    const deltaTime = timestamp - lastTime;
  
    if (deltaTime >= tickInterval) {
      compute_frame();
      
      gl.disable(gl.DEPTH_TEST);
      const fadeProgram = fadeTrailsProgram();
      gl.useProgram(fadeProgram);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.useProgram(program);
      
      const bodyData = updateBodyBuffers();
      gl.bindBuffer(gl.ARRAY_BUFFER, bodyBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, bodyData, gl.DYNAMIC_DRAW);
      
      const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
      
      const positionLoc = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(positionLoc);
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, stride, 0);
      
      const sizeLoc = gl.getAttribLocation(program, "a_pointSize");
      gl.enableVertexAttribArray(sizeLoc);
      gl.vertexAttribPointer(sizeLoc, 1, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
      
      const colorLoc = gl.getAttribLocation(program, "a_color");
      gl.enableVertexAttribArray(colorLoc);
      gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
      
      const resolutionLoc = gl.getUniformLocation(program, "u_resolution");
      gl.uniform2f(resolutionLoc, glCanvas.width, glCanvas.height);
      
      gl.drawArrays(gl.POINTS, 0, bodies.length);
      
      ctx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
      
      diagnostics.update_particle_count(bodies.length);
      menu.draw();
      submenu.draw();
      diagnostics.draw();
  
      lastTime = timestamp;
    }
  
    requestAnimationFrame(animate);
  }

function menu_icon(x, y) {
  if (x >= menu.x && x <= menu.x + menu.width && y >= menu.y && y <= menu.y + menu.height) {
    for (let i = 0; i < menu.icons.length; i++) {
      const iconX = menu.x + 10 + i * menu.icon_size;
      const iconY = menu.y + 10;
      const iconWidth = menu.icon_size;
      const iconHeight = menu.icon_size;

      if (x >= iconX && x <= iconX + iconWidth && y >= iconY && y <= iconY + iconHeight) {
        return i;
      }
    }
  }
  return -1;
}

function submenu_click(x, y) {
    if (tool !== Tools.BRUSH_MENU) return;

    const optionHeight = submenu.height * .1; // Adjusted for slider space

    for (let i = 0; i < submenu.options.length; i++) {
      const optionX = submenu.x + i * submenu.width / 2;
      if (x >= optionX && x <= optionX + submenu.width / 2 &&
          y >= submenu.y && y <= submenu.y + optionHeight) {
          brush.style = submenu.options[i].toLowerCase();
          return;
      }
    }
}

function spawnBrushParticles(x, y) {
    if (brush.style === Brush.BrushType.POINT) {
        bodies.push(new Body(x, y, brush.getColor(), brush.size.value * 30, 0, 0));
    } else if (brush.style === Brush.BrushType.SCATTER) {
        for (let i = 0; i < brush.count.value; i++) {
          const angle = Math.random() * 2 * Math.PI;
          const radius = Math.random() * brush.spread.value;
          const dx = Math.cos(angle) * radius;
          const dy = Math.sin(angle) * radius;
          bodies.push(new Body(x + dx, y + dy, brush.getColor(), Math.random() * 30 * brush.size.value, 0, 0));
        }
    }
}

uiCanvas.addEventListener('click', function(event) {
  const x = event.pageX;
  const y = event.pageY;

  let icon = menu_icon(x, y);
  switch (icon) {
    case 0:
      if (tool == Tools.BRUSH_MENU) {
        tool = Tools.BRUSH;
      }
      else {
        tool = Tools.BRUSH_MENU;
      }
      break;
    case 1:
      menu.play_pause_icon.image.src = paused ? "./assets/pause-icon.png" : "./assets/play-icon.png";
      paused = !paused;
      break;
    case 2:
      // old screenshot button functionality
      const fileName = `gravity-art-${Date.now()}.png`;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = glCanvas.width;
      tempCanvas.height = glCanvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      
      tempCtx.drawImage(glCanvas, 0, 0);
      
      const link = document.createElement('a');
      link.download = fileName;
      link.href = tempCanvas.toDataURL('image/png');
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      break;
    case 3:
      isRecording = !isRecording;
      if (isRecording) {
        startRecording();
        menu.record_icon.image.src = "./assets/record-icon-red.png";
      } else {
        mediaRecorder.stop();
        menu.record_icon.image.src = "./assets/record-icon.png";
      }
      break;
    default:
      submenu_click(x, y);
  }
}, false);

uiCanvas.addEventListener('mousedown', function(event) {
    const x = event.pageX;
    const y = event.pageY;
    if (!menu.checkBounds(x,y) && !submenu.handleMouseDown(x,y) &&
      (tool === Tools.BRUSH || tool == Tools.BRUSH_MENU)) {

      isDragging = true;
      lastBrushX = x;
      lastBrushY = y;
      brush.density_count();
      spawnBrushParticles(x, y);
  }
});

uiCanvas.addEventListener('mousemove', function(event) {
  const x = event.pageX;
  const y = event.pageY;

  const icon = menu_icon(x, y);
  hover = icon !== -1 ? icon : Hover.NONE;

  if (isDragging && (tool === Tools.BRUSH || tool === Tools.BRUSH_MENU)) {
      if (brush.density_count()) {
          spawnBrushParticles(x, y);
      }
      lastBrushX = x;
      lastBrushY = y;
  }
  uiCanvas.style.cursor = submenu.handleMouseMove(x,y) || menu.checkBounds(x,y) ? "default" : "crosshair";
});

uiCanvas.addEventListener('mouseup', function() {
  isDragging = false;
    if (tool === Tools.BRUSH || tool === Tools.BRUSH_MENU) {
        brush.reset_density_counter();
        lastBrushX = null;
        lastBrushY = null;
    }
    submenu.handleMouseUp();
});

colorPicker.addEventListener("input", (e) => {
  brush.color = e.target.value;
});

rainbowMode.addEventListener("input", (e) => {
  brush.rainbowMode = !brush.rainbowMode;
})

let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

function startRecording() {
  recordedChunks = [];
  
  const stream = glCanvas.captureStream(60); 
  
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
  
  let seconds = 0;
  const recordingTimer = setInterval(() => {
    seconds++;
    
    if (seconds >= 60) {
      clearInterval(recordingTimer);
      mediaRecorder.stop();
      isRecording = false;
      menu.record_icon.image.src = "./assets/record-icon.png";
    }
  }, 1000);
  
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };
  
  mediaRecorder.onstop = () => {
    clearInterval(recordingTimer);
    
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gravity-art-${Date.now()}.webm`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
  };
  
  mediaRecorder.start(100);
}

ctx.fillStyle = "black";
ctx.fillRect(0,0,uiCanvas.width, uiCanvas.height);
uiCanvas.style.cursor = "crosshair";

animate(performance.now());
