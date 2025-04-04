const glCanvas = document.getElementById("glCanvas");
const uiCanvas = document.getElementById("uiCanvas");

glCanvas.width = window.innerWidth;
glCanvas.height = window.innerHeight;
uiCanvas.width = window.innerWidth;
uiCanvas.height = window.innerHeight;

const gl = glCanvas.getContext("webgl");
if (!gl) {
    alert("WebGL is not supported by your browser.");
}
const ctx = uiCanvas.getContext("2d");

gl.viewport(0, 0, glCanvas.width, glCanvas.height);

// Vertex Shader
const vertexShaderSource = `
attribute vec2 a_position;
attribute float a_pointSize;
attribute vec3 a_color;
uniform vec2 u_resolution;
varying vec3 v_color;
void main() {
    // Convert pixel space to clip space [-1, 1]
    vec2 zeroToOne = a_position / u_resolution;
    vec2 zeroToTwo = zeroToOne * 2.0;
    vec2 clipSpace = zeroToTwo - 1.0;
    // Adjust for WebGL's inverted y-axis
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
    gl_PointSize = a_pointSize;
    v_color = a_color;
}
`;

// Fragment Shader
const fragmentShaderSource = `
precision mediump float;
varying vec3 v_color;
void main(){
    float dist = distance(gl_PointCoord, vec2(0.5, 0.5));
    if (dist > 0.5) {
       discard;
    }
    gl_FragColor = vec4(v_color, 1.0);
}
`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Error compiling shader:", gl.getShaderInfoLog(shader));
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
        console.error("Program failed to link:", gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    return program;
}

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
const program = createProgram(gl, vertexShader, fragmentShader);

const Tools = {
    CURSOR: "cursor",
    BRUSH: "brush"
};

const Hover = {
    NONE: -1,
    CURSOR: 0,
    BRUSH: 1
}

const G = 0.1;
const numBodies = 300;
const orbitRadius = glCanvas.width / 4;

let tool = Tools.CURSOR;
let hover = Hover.NONE;
let isDragging = false;

class Brush {
    static BrushType = {
        POINT: "point",
        SCATTER: "scatter",
    };

    constructor() {
        this.size = 5;
        this.spread = 0;
        this.count = 1;
        this.density = 1;
        this.style = Brush.BrushType.POINT;
        this.density_counter = 0;
        this.max_density = 100;
    }

    density_count() {
        this.density_counter = (this.density_counter + this.density) % this.max_density;
        return this.density_counter < this.density;
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
        this.width = uiCanvas.width * 0.1;
        this.height = uiCanvas.height * 0.8;
        this.x = uiCanvas.width - this.width - 20;
        this.y = (uiCanvas.height - this.height) / 2;
        this.mouse_icon = new Icon(this.width, "./assets/mouse-icon.png");
        this.paint_brush_icon = new Icon(this.width, "./assets/paint-brush-icon.png");
        this.icons = [this.mouse_icon, this.paint_brush_icon];
        this.icon_size = this.width - 20;
    }
    draw() {
        const x_padding = 10;
        const y_padding = 10;
        let y_offset = 0;

        ctx.fillStyle = 'rgba(128, 128, 128, 0.5)'
        ctx.fillRect(this.x, this.y, this.width, this.height);
        for (const icon of this.icons){
            ctx.drawImage(icon.image, this.x + x_padding, this.y + y_padding + y_offset, this.icon_size, this.icon_size);
            y_offset += this.icon_size;
        }

        // emphasis on hovered icon
        if (hover != -1) {
            console.log("test");
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x + x_padding, this.y + y_padding + this.icon_size * hover, this.icon_size, this.icon_size);
        }
    }
}
class BrushSubMenu {
    constructor(parentMenu) {
        this.parentMenu = parentMenu;
        this.width = parentMenu.width * 0.8;
        this.height = parentMenu.height * 0.3;
        this.x = parentMenu.x - this.width + 10;
        this.y = parentMenu.y + parentMenu.icon_size + 20;
        this.options = ["Point", "Scatter"];
    }

    isMouseOver(x, y) {
        return (x >= this.x && x <= this.x + this.width && y >= this.y && y <= this.y + this.height);
    }

    draw() {
        if (hover == Hover.BRUSH) {
            ctx.fillStyle = 'rgba(128, 128, 128, 0.8)';
            ctx.fillRect(this.x, this.y, this.width, this.height);
    
            ctx.fillStyle = 'white';
            ctx.font = '16px Arial';
            const optionHeight = this.height / this.options.length;
            for (let i = 0; i < this.options.length; i++) {
                const optionY = this.y + i * optionHeight + optionHeight / 2;
                ctx.fillText(this.options[i], this.x + 10, optionY);
            }
        }
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
        this.radius = Math.cbrt(this.mass) * (Math.random() * 2 + 1);
        this.isSun = isSun;
    }

    update(bodies) {
        if (this.isSun) return;
        
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
const submenu = new BrushSubMenu(menu);
const sun = new Body(glCanvas.width / 2, glCanvas.height / 2, 'yellow', 1000, 0, 0, true);
const brush = new Brush;
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

let lastTime = 0;
const tickRate = 60; // 60 ticks per second
const tickInterval = 1000 / tickRate;

const buffer = gl.createBuffer();

function updateBuffers() {
    const data = [];
    for (let body of bodies) {
        let r = 0, g = 0, b = 0;
        if (body.color === 'blue') {
            r = 0; g = 0; b = 1;
        } else if (body.color === 'yellow') {
            r = 1; g = 1; b = 0;
        }
        data.push(body.x, body.y, body.radius, r, g, b);
    }
    // return new Float32Array(data);
    const floatData = new Float32Array(data);
    console.log('updateBuffers - Data length:', floatData.length, 'Data:', floatData);
    return floatData;
}

function animate(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const deltaTime = timestamp - lastTime;
    console.log('animate - deltaTime:', deltaTime);

    if (deltaTime >= tickInterval) {
        // ctx.fillStyle = "black";
        // ctx.fillRect(0, 0, canvas.width, canvas.height);
        // for (let body of bodies) {
        //     body.update(bodies);
        //     body.draw();
        // }
        // menu.draw();
        // submenu.draw();
        // lastTime = timestamp;

        ctx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
        menu.draw();
        submenu.draw();

        console.log('animate - Number of bodies:', bodies.length);

        for (let body of bodies) {
            body.update(bodies);
        }

        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        const drawData = updateBuffers();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, drawData, gl.DYNAMIC_DRAW);
        console.log('animate - Buffer data updated.');

        gl.useProgram(program);

        const resolutionUniformLocation = gl.getUniformLocation(program, "u_resolution");
        gl.uniform2f(resolutionUniformLocation, glCanvas.width, glCanvas.height);

        const stride = 6 * Float32Array.BYTES_PER_ELEMENT;

        const positionLocation = gl.getAttribLocation(program, "a_position");
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, 0);

        const pointSizeLocation = gl.getAttribLocation(program, "a_pointSize");
        gl.enableVertexAttribArray(pointSizeLocation);
        gl.vertexAttribPointer(pointSizeLocation, 1, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);

        const colorLocation = gl.getAttribLocation(program, "a_color");
        gl.enableVertexAttribArray(colorLocation);
        gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);

        gl.drawArrays(gl.POINTS, 0, bodies.length);
        console.log('animate - DrawArrays called for', bodies.length, 'points.');

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
    
            if (
                x >= iconX &&
                x <= iconX + iconWidth &&
                y >= iconY &&
                y <= iconY + iconHeight
            ) {
                return i;
            }
        }
    }
    return -1;
}

uiCanvas.addEventListener('click', function(event) {
    const rect = uiCanvas.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var y = event.clientY - rect.top;

    if (submenu.isMouseOver(x, y)) {
        const optionHeight = submenu.height / submenu.options.length;
        const optionIndex = Math.floor((y - submenu.y) / optionHeight);
        const option = submenu.options[optionIndex];

        if (option === "Point") {
            brush.style = Brush.BrushType.POINT;
        } else if (option === "Scatter") {
            brush.style = Brush.BrushType.SCATTER;
        }
        return;
    }

    // Menu click
    let icon = menu_icon(x,y);
    if (icon === 0) {
        tool = Tools.CURSOR;
        uiCanvas.style.cursor = "default"; // Reset to default cursor
    }
    else if (icon === 1) {
        tool = Tools.BRUSH;
        uiCanvas.style.cursor = "crosshair"; // Change cursor to crosshair
    }
}, false);

uiCanvas.addEventListener('mousedown', function(event) {
    const rect = uiCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (tool === Tools.BRUSH) {
        isDragging = true;
        brush.density_count();
        bodies.push(new Body(x, y, 'blue', Math.random() * 30 + 1, 0, 0))
    }
});

uiCanvas.addEventListener('mousemove', function(event) {
    const rect = uiCanvas.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var y = event.clientY - rect.top;
    
    // Check main menu 
    const icon = menu_icon(x, y);
    if (icon === 1 || (tool === Tools.BRUSH && submenu.isMouseOver(x,y))) {
        hover = Hover.BRUSH;
    } else if (icon === 0) {
        hover = Hover.CURSOR;
    } else {
        hover = Hover.NONE;
    }

    // Paint
    if (isDragging && tool === Tools.BRUSH) {
        if (brush.density_count()) {
            bodies.push(new Body(x, y, 'blue', Math.random() * 30 + 1, 0, 0))
            console.log(bodies.length);
        }
    }
});

uiCanvas.addEventListener('mouseup', function() {
    if (tool === Tools.BRUSH) {
        isDragging = false;
        brush.reset_density_counter();
    }
});

animate();

// newtons law force between two bodies
// F = (G * m1 * m2) / (r^2)