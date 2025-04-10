const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
  // work in-progress
  window.location.reload();
});

const colorPicker = document.getElementById("colorPicker");
const playPauseButton = document.getElementById("playPauseButton");

const Tools = {
  CURSOR: "cursor",
  BRUSH: "brush",
};

const Hover = {
  NONE: -1,
  CURSOR: 0,
  BRUSH: 1,
};

const Algorithms = {
  N_SQUARED: "N_SQUARED",
  KD: "KD",
}

const G = 0.1;
const numBodies = 300;
const orbitRadius = canvas.width / 4;

let tool = Tools.CURSOR;
let hover = Hover.NONE;
let algorithm = Algorithms.N_SQUARED;
let isDragging = false;
let lastBrushX = null;
let lastBrushY = null;
let paused = false;
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
    }

    density_count() {
        this.density_counter = (this.density_counter + this.density.value) % this.max_density;
        return this.density_counter < this.density.value;
    }

  reset_density_counter() {
    this.density_counter = 0;
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
    this.width = canvas.width * 0.1;
    this.height = canvas.height * 0.8;
    this.x = canvas.width - this.width - 20;
    this.y = (canvas.height - this.height) / 2;
    this.mouse_icon = new Icon(this.width, "./assets/mouse-icon.png");
    this.paint_brush_icon = new Icon(this.width, "./assets/paint-brush-icon.png");
    this.icons = [this.mouse_icon, this.paint_brush_icon];
    this.icon_size = this.width - 20;
  }

  draw() {
    const x_padding = 10;
    const y_padding = 10;
    let y_offset = 0;

    ctx.fillStyle = 'rgba(128, 128, 128, 0.5)';
    ctx.fillRect(this.x, this.y, this.width, this.height);

    for (const icon of this.icons) {
      ctx.drawImage(icon.image, this.x + x_padding, this.y + y_padding + y_offset, this.icon_size, this.icon_size);
      y_offset += this.icon_size;
    }

    if (hover != -1) {
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.x + x_padding, this.y + y_padding + this.icon_size * hover, this.icon_size, this.icon_size);
    }
  }
}

class BrushSubMenu {
    constructor(parentMenu, brush) {
        this.parentMenu = parentMenu;
        this.width = parentMenu.width * 0.8;
        this.height = parentMenu.height * 0.8; // Increased height to accommodate slider
        this.x = parentMenu.x - this.width - 10;
        this.y = parentMenu.y + 20;
        this.options = ["Point", "Scatter"];
        this.density_slider = new Slider("density", this.x + 10, this.y + this.height - 200, 100, brush.density);
        this.size_slider = new Slider("size", this.x + 10, this.y + this.height - 150, 100, brush.size);
        this.spread_slider = new Slider("spread", this.x + 10, this.y + this.height - 100, 100, brush.spread);
        this.count_slider = new Slider("count", this.x + 10, this.y + this.height - 50, 100, brush.count);
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
        if (tool === Tools.BRUSH) {
            ctx.fillStyle = 'rgba(128, 128, 128, 0.8)';
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.font = '16px Arial';
            const optionHeight = 100 // Adjusted for slider space
            for (let i = 0; i < this.options.length; i++) {
                const optionY = this.y + i * optionHeight;

                if (brush.style === this.options[i].toLowerCase()) {
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(this.x, optionY, this.width, optionHeight);
                }

                ctx.fillStyle = 'white';
                ctx.fillText(this.options[i], this.x + 10, optionY + optionHeight / 2);
            }

            const colorPickerX = this.x + this.width * .3;
            const colorPickerY = this.y + this.height - 30;


            colorPicker.style.display = "block";

            colorPicker.style.left = `${colorPickerX}px`;
            colorPicker.style.top = `${colorPickerY}px`;

            for (const slider of this.sliders) {
                slider.draw();
            }
        } else {
          colorPicker.style.display = "none";
        }
    }

    handleMouseDown(x, y) {
        for (const slider of this.sliders) {
            slider.handleMouseDown(x, y);
        }
    }

    handleMouseMove(x, y) {
        for (const slider of this.sliders) {
            slider.handleMouseMove(x, y);
        }
    }

    handleMouseUp() {
        for (const slider of this.sliders) {
            slider.handleMouseUp();
        }
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
    console.log(particle_count);
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

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}

const bodies = [];
const menu = new Menu();
const brush = new Brush();
const submenu = new BrushSubMenu(menu, brush);
const diagnostics = new Diagnostics(100, 50, 200);
const sun = new Body(canvas.width / 2, canvas.height / 2, 'yellow', 1000, 0, 0, true);
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

function compute_frame() {
  let start = performance.now();
  switch(algorithm) {
    case Algorithms.N_SQUARED:
      n_squared();
      break;
    case Algorithms.KD:
      // Implement KD algorithm logic here
      break;
    default:
      console.error("Unknown algorithm");
      break;
    }
  const compute_time = performance.now() - start;
  diagnostics.update_time(compute_time);
}

function n_squared() {
  for (let body of bodies) {
    body.compute_n_squared(bodies);
  }
}

function animate(timestamp) {
  if (!lastTime) {
    lastTime = timestamp;
  }
  const deltaTime = timestamp - lastTime;

  if (deltaTime >= tickInterval) {
    //ctx.fillStyle = "black";
    ctx.fillStyle = "rgba(0,0,0,.1)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    
    compute_frame();

    for (body of bodies) {
      body.draw();
    }
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
      const iconX = menu.x + 10;
      const iconY = menu.y + 10 + i * menu.icon_size;
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
    if (tool !== Tools.BRUSH) return;
    const optionHeight = 100
    for (let i = 0; i < submenu.options.length; i++) {
        const optionY = submenu.y + i * optionHeight;
        if (x >= submenu.x && x <= submenu.x + submenu.width &&
            y >= optionY && y <= optionY + optionHeight) {
            brush.style = submenu.options[i].toLowerCase();
            return;
        }
    }
}

function spawnBrushParticles(x, y) {
    const color = brush.color;
    if (brush.style === Brush.BrushType.POINT) {
        console.log(brush.size.value);
        bodies.push(new Body(x, y, color, brush.size.value * 30, 0, 0));
    } else if (brush.style === Brush.BrushType.SCATTER) {
        for (let i = 0; i < brush.count.value; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const radius = Math.random() * brush.spread.value;
            const dx = Math.cos(angle) * radius;
            const dy = Math.sin(angle) * radius;
            bodies.push(new Body(x + dx, y + dy, color, Math.random() * 30 * brush.size.value, 0, 0));
        }
    }
}

canvas.addEventListener('click', function(event) {
  const x = event.pageX;
  const y = event.pageY;

  let icon = menu_icon(x, y);
  if (icon === 0) {
    tool = Tools.CURSOR;
    canvas.style.cursor = "default";
  } else if (icon === 1) {
    tool = Tools.BRUSH;
    canvas.style.cursor = "crosshair";
  } else {
    submenu_click(x, y);
  }
}, false);

canvas.addEventListener('mousedown', function(event) {
    const x = event.pageX;
    const y = event.pageY;
    if (tool === Tools.BRUSH) {
        isDragging = true;
        lastBrushX = x;
        lastBrushY = y;
        brush.density_count();
        spawnBrushParticles(x, y);
    }
    submenu.handleMouseDown(x,y);
});

canvas.addEventListener('mousemove', function(event) {
  const x = event.pageX;
  const y = event.pageY;

  const icon = menu_icon(x, y);
  hover = icon !== -1 ? icon : Hover.NONE;

    if (isDragging && tool === Tools.BRUSH) {
        if (brush.density_count()) {
            spawnBrushParticles(x, y);
        }
        lastBrushX = x;
        lastBrushY = y;
    }
    submenu.handleMouseMove(x,y);
});

canvas.addEventListener('mouseup', function() {
    if (tool === Tools.BRUSH) {
        isDragging = false;
        brush.reset_density_counter();
        lastBrushX = null;
        lastBrushY = null;
    }
    submenu.handleMouseUp();
});

colorPicker.addEventListener("input", (e) => {
  brush.color = e.target.value;
});

playPauseButton.addEventListener("click", () => {
  paused = !paused;
  playPauseButton.textContent = paused ? "Play" : "Pause";
});

ctx.fillStyle = "black";
ctx.fillRect(0,0,canvas.width, canvas.height);
animate(performance.now());
