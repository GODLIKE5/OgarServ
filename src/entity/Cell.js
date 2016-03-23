function Cell(nodeId, owner, position, mass, gameServer) {
    this.nodeId = nodeId;
    this.owner = owner; // playerTracker that owns this cell
    this.name = '';
    this.skin = '';
    this.color = {
        r:       Math.floor(Math.random() * 32),
        g: 196 + Math.floor(Math.random() * 32),
        b:       Math.floor(Math.random() * 32)
    };
    this.position = position;
    this.mass = mass; // Starting mass of the cell
    this.cellType = -1; // 0 = Player Cell, 1 = Food, 2 = Virus, 3 = Ejected Mass
    this.spiked = 0; // If 1, then this cell has spikes around it
    this.agitated = 0; // If 1, then this cells is all jiggly looking (not used in vanilla)
    this.killedBy; // Cell that ate this cell
    this.gameServer = gameServer;
    this.moveEngineTicks = 0; // Amount of times to loop the movement function
    this.moveEngineSpeed = 0;
    this.moveDecay = 0.75;
    this.angle = 0; // Angle of movement
}

module.exports = Cell;

// Fields not defined by the constructor are considered private and need a getter/setter to access from a different class
Cell.prototype.getName = function () {
    if (this.owner) {
        if(this.name != this.owner.name) this.name = this.owner.name;
        return this.name;
    } else {
        return "";
    }
};

Cell.prototype.getSkin = function () {
    return "";

    switch (this.cellType) {
        case 0:
            // Player cell
            if (this.owner) {
                if(this.skin != this.owner.skin) this.skin = this.owner.skin;
                return this.skin;
            }
            break
        case 1:
            // Food cell
            break;
        case 2:
            // Mother or Virus cell
            if(this.skin == '') this.skin = "%gas";
            return "%gas";
            break;
        case 3:
            // Ejected Mas
            if(this.skin == '') this.skin = "%proton";
            return "%proton";
            break;
        case 4:
            // Sticky cell
            break;
        case 5:
            // Beacon cell
            if(this.skin == '') this.skin = "%gas";
            return "%gas";
            break;
        default:
            break;
    }
    return "";
};

Cell.prototype.setColor = function (color) {
    this.color.r = color.r;
    this.color.g = color.g;
    this.color.b = color.b;
};

Cell.prototype.getColor = function () {
    return this.color;
};

Cell.prototype.getType = function () {
    return this.cellType;
};

Cell.prototype.getSize = function () {
    // Calculates radius based on cell mass
    return Math.ceil(Math.sqrt(100 * this.mass));
};

Cell.prototype.getSquareSize = function () {
    // R * R
    return (100 * this.mass) >> 0;
};

Cell.prototype.addMass = function(n) {
    if (this.mass + n > this.owner.gameServer.config.playerMaxMass && this.owner.cells.length < this.owner.gameServer.config.playerMaxCells) {
        this.mass = (this.mass + n) / 2;
        var randomAngle = Math.random() * 6.28 // Get random angle
        this.owner.gameServer.newCellVirused(this.owner, this, randomAngle, this.mass, 480);
    } else {
        this.mass = Math.min(this.mass + n, this.owner.gameServer.config.playerMaxMass);
    }
};

Cell.prototype.getSpeed = function () {
    // Old formula: 5 + (20 * (1 - (this.mass/(70+this.mass))));
    // Based on 50ms ticks. If updateMoveEngine interval changes, change 50 to new value
    // (should possibly have a config value for this?)
    return this.owner.gameServer.config.playerSpeed * Math.pow(this.mass, -1.0 / 4.5) * 50 / 40;
};

Cell.prototype.setAngle = function (radians) {
    this.angle = radians;
};

Cell.prototype.getAngle = function () {
    return this.angle;
};

Cell.prototype.setMoveEngineData = function (speed, ticks, decay) {
    this.moveEngineSpeed = speed;
    this.moveEngineTicks = ticks;
    this.moveDecay = isNaN(decay) ? 0.75 : decay;
};

Cell.prototype.getEatingRange = function () {
    return 0; // 0 for ejected cells
};

Cell.prototype.getKiller = function () {
    return this.killedBy;
};

Cell.prototype.setKiller = function (cell) {
    this.killedBy = cell;
};

// Functions

Cell.prototype.collisionCheck = function (bottomY, topY, rightX, leftX) {
    // Collision checking
    if (this.position.y > bottomY) {
        return false;
    }

    if (this.position.y < topY) {
        return false;
    }

    if (this.position.x > rightX) {
        return false;
    }

    if (this.position.x < leftX) {
        return false;
    }

    return true;
};

// This collision checking function is based on CIRCLE shape
Cell.prototype.collisionCheck2 = function (objectSquareSize, objectPosition) {
    // IF (O1O2 + r <= R) THEN collided. (O1O2: distance b/w 2 centers of cells)
    // (O1O2 + r)^2 <= R^2
    // approximately, remove 2*O1O2*r because it requires sqrt(): O1O2^2 + r^2 <= R^2

    var dx = this.position.x - objectPosition.x;
    var dy = this.position.y - objectPosition.y;

    return (dx * dx + dy * dy + this.getSquareSize() <= objectSquareSize);
};

Cell.prototype.visibleCheck = function (box, centerPos) {
    // Checks if this cell is visible to the player
    return this.collisionCheck(box.bottomY, box.topY, box.rightX, box.leftX);
};

Cell.prototype.calcMovePhys = function (config, gameServer) {
    // Movement engine (non player controlled movement)
    var speed = this.moveEngineSpeed;
    var r = this.getSize();
    this.moveEngineSpeed *= this.moveDecay; // Decaying speed
    this.moveEngineTicks--;

    // Calculate new position
    var sin = Math.sin(this.angle);
    var cos = Math.cos(this.angle);
    if (this.cellType == 0) {
        //split movement and consume check for player cells
        var maxTravel = r; //check inbetween places (is needed when cell has higher speed than cell radius) - max inbetween move before next check is cell radius
        var totTravel = 0;
        do {
            totTravel = Math.min(totTravel + maxTravel, speed);
            var x1 = this.position.x + (totTravel * sin);
            var y1 = this.position.y + (totTravel * cos);
            var xSave = this.position.x;
            var ySave = this.position.y;
            this.position.x = x1;
            this.position.y = y1;
            var list = this.owner.gameServer.getCellsInRange(this);
            for (var j = 0, llen = list.length; j < llen; j++) {
                var check = list[j];
                check.onConsume(this, this.owner.gameServer);
                check.setKiller(this);
                this.owner.gameServer.removeNode(check);
            }
            this.position.x = xSave;
            this.position.y = ySave;
        }
        while (totTravel < speed);
    } else if (this.cellType == 113) {
        //movement and collision check for ejected mass cells
        var collisionDist = r * 2 - 5; // Minimum distance between the 2 cells (allow cells to go a little inside eachother before moving them)
        var maxTravel = r; //check inbetween places for collisions (is needed when cell still has high speed) - max inbetween move before next collision check is cell radius
        var totTravel = 0;
        var xd = 0;
        var yd = 0;
        do {
            totTravel = Math.min(totTravel + maxTravel, speed);
            var x1 = this.position.x + (totTravel * sin) + xd;
            var y1 = this.position.y + (totTravel * cos) + yd;
            for (var i = 0, llen = gameServer.nodesEjected.length; i < llen; i++) {
                var cell = gameServer.nodesEjected[i];
                if (this.nodeId == cell.nodeId) {
                    continue;
                }
                if (!this.simpleCollide(x1, y1, cell, collisionDist)) {
                    continue;
                }
                var dist = this.getDist(x1, y1, cell.position.x, cell.position.y);
                if (dist < collisionDist) { // Collided
                    var newDeltaY = cell.position.y - y1;
                    var newDeltaX = cell.position.x - x1;
                    var newAngle = Math.atan2(newDeltaX, newDeltaY);
                    var move = (collisionDist - dist + 5) / 2; //move cells each halfway until they touch
                    var xmove = move * Math.sin(newAngle);
                    var ymove = move * Math.cos(newAngle);
                    cell.position.x += xmove >> 0;
                    cell.position.y += ymove >> 0;
                    xd += -xmove;
                    yd += -ymove;
                    if (cell.moveEngineTicks == 0) {
                        cell.setMoveEngineData(0, 1); //make sure a collided cell checks again for collisions with other cells
                        if (gameServer.movingNodes.indexOf(cell) == -1) {
                            gameServer.setAsMovingNode(cell);
                        }
                    }
                    if (this.moveEngineTicks == 0) {
                        this.setMoveEngineData(0, 1); //make sure a collided cell checks again for collisions with other cells
                    }
                }
            }
        }
        while (totTravel < speed);
        x1 = this.position.x + (speed * sin) + xd;
        y1 = this.position.y + (speed * cos) + yd;
    } else {
        //movement for viruses
        var x1 = this.position.x + (speed * sin);
        var y1 = this.position.y + (speed * cos);
    }

    // Border check - Bouncy physics
    var radius = 40;
    if ((x1 - radius) < config.borderLeft) {
        // Flip angle horizontally - Left side
        this.angle = 6.28 - this.angle;
        x1 = config.borderLeft + radius;
    }
    if ((x1 + radius) > config.borderRight) {
        // Flip angle horizontally - Right side
        this.angle = 6.28 - this.angle;
        x1 = config.borderRight - radius;
    }
    if ((y1 - radius) < config.borderTop) {
        // Flip angle vertically - Top side
        this.angle = (this.angle <= 3.14) ? 3.14 - this.angle : 9.42 - this.angle;
        y1 = config.borderTop + radius;
    }
    if ((y1 + radius) > config.borderBottom) {
        // Flip angle vertically - Bottom side
        this.angle = (this.angle <= 3.14) ? 3.14 - this.angle : 9.42 - this.angle;
        y1 = config.borderBottom - radius;
    }

    // Set position
    this.position.x = x1 >> 0;
    this.position.y = y1 >> 0;
};

// Lib
Cell.prototype.simpleCollide = function (x1, y1, check, d) {
    // Simple collision check
    var len = d >> 0;
    return (this.abs(x1 - check.position.x) < len) && (this.abs(y1 - check.position.y) < len);
};

Cell.prototype.abs = function (x) {
    return x < 0 ? -x : x;
};

Cell.prototype.getDist = function (x1, y1, x2, y2) {
    var xs = x2 - x1;
    xs = xs * xs;

    var ys = y2 - y1;
    ys = ys * ys;

    return Math.sqrt(xs + ys);
};

// Override these
Cell.prototype.sendUpdate = function () {
    // Whether or not to include this cell in the update packet
    return true;
};

Cell.prototype.onConsume = function (consumer, gameServer) {
    // Called when the cell is consumed
};

Cell.prototype.onAdd = function (gameServer) {
    // Called when this cell is added to the world
};

Cell.prototype.onRemove = function (gameServer) {
    // Called when this cell is removed
};

Cell.prototype.onAutoMove = function (gameServer) {
    // Called on each auto move engine tick
};

Cell.prototype.moveDone = function (gameServer) {
    // Called when this cell finished moving with the auto move engine
    this.onAutoMove(gameServer);
};
