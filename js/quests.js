// Quests & Storyline State Machine for Messenger Planet
// Faithful recreation of all 5 quests and character dialogues from messenger.abeto.co

class QuestManager {
  constructor(player, npcManager) {
    this.player = player;
    this.npcManager = npcManager;

    this.quests = [
      {
        id: 'quest-employee',
        title: 'Falling off the Corporate Ladder',
        description: 'Office worker sent an angry roast letter to his boss by mistake.',
        color: '#c25959',
        icon: '👔',
        steps: [
          {
            npcId: 'office-worker-2',
            actionText: 'Find the red cliff house and get the letter back',
            dialogue: [
              "Thank god you're here! I sent a letter to my boss earlier, but I need to get it back before he sees it...",
              "He lives at the red cliff house. Do you think he's read it yet?"
            ],
            givesPackage: true,
            packageColor: 0xd97706
          },
          {
            npcId: 'boss',
            actionText: 'Take the Boss\'s note back to the Office Worker in Main Square',
            dialogue: [
              "One of my employees wrote this? I can't believe it... this... is...",
              "...hilarious! Wow, he's really roasting me. Maybe he's manager material after all...",
              "Can you take this note back to him? He works in the main square."
            ],
            givesPackage: true,
            packageColor: 0xf59e0b
          },
          {
            npcId: 'office-worker-2',
            actionText: 'Deliver the promotion note to the Office Worker',
            dialogue: [
              "I'm getting... promoted?!",
              "Wow, who would have known that acting on my lowest instincts would help me advance in the corporate world."
            ],
            givesPackage: false
          }
        ]
      },
      {
        id: 'quest-caveman',
        title: 'A Man Who\'s Hiding from Something',
        description: 'A husband living in a cave and his understanding wife in town.',
        color: '#f3c258',
        icon: '🍖',
        steps: [
          {
            npcId: 'caveman',
            actionText: 'Take the Cave Man\'s postcard to the Flower Lady in Main Square',
            dialogue: [
              "Hey there! Can you please take this postcard to my wife? She sells flowers in the main square.",
              "I'd give it to her myself but I... uh... have a bad knee at the moment..."
            ],
            givesPackage: true,
            packageColor: 0x38bdf8
          },
          {
            npcId: 'flower-lady',
            actionText: 'Take the clean clothes to the man in the cave',
            dialogue: [
              "Oh, a postcard from my husband! He's on an overseas business trip at the moment, visiting all kinds of exotic places!",
              "Look, between you and me, I know he's living in a cave in the forest... I hope his midlife crisis passes soon...",
              "Would you mind bringing him these clean clothes? Don't say they're from me. Just tell him he won a prize."
            ],
            givesPackage: true,
            packageColor: 0x10b981
          },
          {
            npcId: 'caveman',
            actionText: 'Deliver clean clothes to the Caveman',
            dialogue: [
              "Wow, another prize?",
              "Just in time, too. I'm down to my last pair of underwear."
            ],
            givesPackage: false
          }
        ]
      },
      {
        id: 'quest-scientists',
        title: 'Scientists & Mixed-Up Deliveries',
        description: 'Capital Corp deliveries went to the wrong scientists.',
        color: '#66bde6',
        icon: '🔬',
        steps: [
          {
            npcId: 'male-scientist',
            actionText: 'Take the Gravity Data Analysis to Dr. Frebi at Capital Corp',
            dialogue: [
              "Hello! Yes, I opened some mail by mistake earlier. A 'planet gravity data analysis', or something...",
              "They probably mixed me up with Doctor Frebi at Capital Corp...",
              "...wait, does that mean MY ORDER went to Dr Frebi? Oh no!!!",
              "I... uh... ordered the wrong thing anyway... Tell her I don't need it anymore..."
            ],
            givesPackage: true,
            packageColor: 0x8b5cf6
          },
          {
            npcId: 'female-scientist',
            actionText: 'Deliver Gravity Analysis to Dr. Frebi at Capital Corp',
            dialogue: [
              "Oh hey, you work for the delivery company? I've been meaning to talk to you guys...",
              "Do you know why I received 63 packets of instant noodles? Was that meant to go to the grocery store or something?",
              "You don't know anything about that? Oh well. Thanks for the package!"
            ],
            givesPackage: false
          }
        ]
      },
      {
        id: 'quest-temple',
        title: 'An Offering to the Mountain Temple',
        description: 'Deliver sacred pastries and sake up the steep mountain.',
        color: '#8cc48c',
        icon: '🍵',
        steps: [
          {
            npcId: 'oldwoman',
            actionText: 'Take the Old Woman\'s offering up to the Mountain Shrine',
            dialogue: [
              "Excuse me, could you please take this offering up to the mountain temple for me?",
              "I have trouble making it up the slope by myself these days."
            ],
            givesPackage: true,
            packageColor: 0x84cc16
          },
          {
            npcId: 'mountainman',
            actionText: 'Deliver sacred offering to the Mountain Man',
            dialogue: [
              "Oh, pastries and sake?",
              "My favourite."
            ],
            givesPackage: false
          }
        ]
      },
      {
        id: 'quest-musician',
        title: 'A Note Lost at Sea',
        description: 'A message in an oyster shell for Dave the Musician.',
        color: '#de794e',
        icon: '🎸',
        steps: [
          {
            npcId: 'diver',
            actionText: 'Take the wet mystery letter to Dave at Smelly Falls',
            dialogue: [
              "Check this out! I was diving for oysters earlier and found this old lock box buried in the sand.",
              "One of them had a letter inside. It's a bit wet, but I can make out the name Dave at the top.",
              "Pretty crazy huh? I know a guy called Dave. Do you think it could be the same one?",
              "He's probably down at smelly falls, if you want to take it to him."
            ],
            givesPackage: true,
            packageColor: 0xec4899
          },
          {
            npcId: 'musician',
            actionText: 'Deliver wet letter to Dave at Smelly Falls',
            dialogue: [
              "A letter for me? From under the sea? The one who wrote it... is me!",
              "Let's see what I wrote to myself all those years ago...",
              "'Dear Future Dave...'",
              "'Keep practicing every day...'",
              "'Get plenty of sunshine...'",
              "'Take care of your hair. Let it grow wild and free. Your hair is your soul and the most defining feature of your personality.'",
              "Well...",
              "...two out of three ain't bad."
            ],
            givesPackage: false
          }
        ]
      }
    ];

    // State tracking
    this.currentQuestIndex = 0;
    this.currentStepIndex = 0;
    this.completedQuests = new Set();
    this.isDialogueActive = false;
    this.dialogueQueue = [];
    this.currentSpeaker = null;

    // UI elements
    this.questBanner = document.getElementById('quest-banner');
    this.questTitleTag = document.getElementById('quest-title-tag');
    this.questInstruction = document.getElementById('quest-instruction-text');
    this.questDistanceText = document.getElementById('quest-distance-text');
    this.questBadge = document.getElementById('quest-badge');

    this.dialogueBox = document.getElementById('dialogue-box');
    this.dialogueName = document.getElementById('dialogue-npc-name');
    this.dialogueRole = document.getElementById('dialogue-npc-role');
    this.dialogueAvatar = document.getElementById('dialogue-npc-avatar');
    this.dialogueText = document.getElementById('dialogue-text');
    this.dialogueNextBtn = document.getElementById('dialogue-next-btn');

    this.celebrationOverlay = document.getElementById('celebration-overlay');
    this.celebrationTitle = document.getElementById('celebration-title');
    this.celebrationDesc = document.getElementById('celebration-desc');
    this.celebrationCloseBtn = document.getElementById('celebration-close-btn');

    this.bindEvents();
    this.updateHUD();
    this.renderQuestList();
  }

  bindEvents() {
    if (this.dialogueNextBtn) {
      this.dialogueNextBtn.addEventListener('click', () => this.advanceDialogue());
    }
    if (this.celebrationCloseBtn) {
      this.celebrationCloseBtn.addEventListener('click', () => {
        this.celebrationOverlay.classList.add('hidden');
      });
    }

    // Space key advances dialogue
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && this.isDialogueActive) {
        e.preventDefault();
        this.advanceDialogue();
      }
    });

    // Tap dialogue box advances dialogue
    if (this.dialogueBox) {
      this.dialogueBox.addEventListener('click', () => {
        if (this.isDialogueActive) this.advanceDialogue();
      });
    }
  }

  getCurrentQuest() {
    return this.quests[this.currentQuestIndex];
  }

  getCurrentStep() {
    const q = this.getCurrentQuest();
    return q ? q.steps[this.currentStepIndex] : null;
  }

  // Handle player interaction with an NPC
  interactWithNPC(npc) {
    if (this.isDialogueActive) return;

    const currentStep = this.getCurrentStep();
    const currentQuest = this.getCurrentQuest();

    // Check if this NPC is the target of current quest step
    if (currentStep && currentStep.npcId === npc.id) {
      this.startDialogue(npc, currentStep.dialogue, () => {
        // Step completed!
        if (currentStep.givesPackage) {
          this.player.setCarryingPackage(true, currentStep.packageColor);
          window.audioManager?.playPackageReceived();
        }

        this.currentStepIndex++;
        if (this.currentStepIndex >= currentQuest.steps.length) {
          // Entire Quest completed!
          this.completeQuest(currentQuest);
        } else {
          this.updateHUD();
        }
      });
      return;
    }

    // Generic friendly banter if not active quest NPC
    const banter = this.getGenericBanter(npc);
    this.startDialogue(npc, banter);
  }

  getGenericBanter(npc) {
    const banterMap = {
      'office-worker-2': ["So many spreadsheets, so little time...", "Did you hear that rumor about the CEO's cliff house?"],
      'flower-lady': ["Fresh roses and mountain lilies! Perfect gift for someone special.", "The breeze feels so lovely on the town square."],
      'boss': ["Time is money! Deliver with precision and excellence.", "Capital Corp is expanding its operations across the hemisphere."],
      'caveman': ["Life in the cave is so peaceful. No emails, no deadlines.", "Just me, the campfire, and some roasted mushrooms."],
      'male-scientist': ["The gravitational curvature on this small planet is simply fascinating!", "F = G * (m1 * m2) / r^2, don't you ever forget it."],
      'female-scientist': ["Quantum computing and noodle manufacturing: the two pillars of science.", "Keep up the great delivery pace, courier!"],
      'oldwoman': ["It's always a blessing to see polite young couriers.", "Take good care of your knees as you get older, child."],
      'mountainman': ["The mountain wind cleanses the spirit.", "Up here, one can see the entire curvature of the world."],
      'diver': ["The coral reefs down here are dazzling with bioluminescent pearls.", "Always check your air tank before deep diving!"],
      'musician': ["♪ Riding across the spherical sky, parcels delivering low and high... ♪", "Music is the heartbeat of this little world."]
    };
    return banterMap[npc.id] || ["Hello courier! Enjoying the sunny day?"];
  }

  startDialogue(npc, lines, onComplete = null) {
    this.isDialogueActive = true;
    this.currentSpeaker = npc;
    this.dialogueQueue = [...lines];
    this.onDialogueComplete = onComplete;

    this.dialogueName.textContent = npc.name;
    this.dialogueRole.textContent = npc.role;
    this.dialogueAvatar.textContent = npc.avatar;

    this.dialogueBox.classList.remove('hidden');
    this.showNextLine();
  }

  showNextLine() {
    if (this.dialogueQueue.length === 0) {
      this.closeDialogue();
      return;
    }

    const line = this.dialogueQueue.shift();
    this.dialogueText.textContent = line;
    window.audioManager?.playDialogueBlip(this.currentSpeaker?.pitch || 1.0);
  }

  advanceDialogue() {
    if (!this.isDialogueActive) return;
    this.showNextLine();
  }

  closeDialogue() {
    this.isDialogueActive = false;
    this.dialogueBox.classList.add('hidden');
    if (this.onDialogueComplete) {
      const cb = this.onDialogueComplete;
      this.onDialogueComplete = null;
      cb();
    }
  }

  completeQuest(quest) {
    this.completedQuests.add(quest.id);
    this.player.setCarryingPackage(false);
    window.audioManager?.playDeliveryCompleted();

    // Show celebration banner
    this.celebrationTitle.textContent = 'DELIVERY COMPLETED!';
    this.celebrationDesc.textContent = `You finished: "${quest.title}"!\nAnother successful delivery recorded.`;
    this.celebrationOverlay.classList.remove('hidden');

    // Move to next quest
    this.currentQuestIndex++;
    this.currentStepIndex = 0;

    this.updateHUD();
    this.renderQuestList();

    if (this.completedQuests.size === this.quests.length) {
      setTimeout(() => {
        this.celebrationTitle.textContent = 'PLANET MASTER COURIER! 🪐';
        this.celebrationDesc.textContent = 'CONGRATULATIONS! You have completed all 5 deliveries and brought joy to every corner of the planet!';
        this.celebrationOverlay.classList.remove('hidden');
      }, 1500);
    }
  }

  updateHUD() {
    const q = this.getCurrentQuest();
    const s = this.getCurrentStep();

    if (!q || !s) {
      this.questTitleTag.textContent = 'ALL DELIVERIES COMPLETED!';
      this.questInstruction.textContent = 'Enjoy your relaxing stroll across the planet!';
      this.questDistanceText.textContent = '⭐ 100% Completed';
      this.questBanner.classList.remove('hidden');
      this.questBadge.textContent = `${this.completedQuests.size}/5`;
      return;
    }

    this.questBanner.classList.remove('hidden');
    this.questTitleTag.textContent = q.title.toUpperCase();
    this.questInstruction.textContent = s.actionText;
    this.questBadge.textContent = `${this.completedQuests.size}/5`;
  }

  updateCompass(playerPos, camera) {
    const s = this.getCurrentStep();
    if (!s) return;

    const targetNPC = this.npcManager.getNPCById(s.npcId);
    if (!targetNPC) return;

    const targetPos = targetNPC.group.position;
    const dist = Math.round(playerPos.distanceTo(targetPos));
    this.questDistanceText.querySelector('.dist').textContent = `${dist}m`;
  }

  renderQuestList() {
    const container = document.getElementById('quest-list');
    if (!container) return;
    container.innerHTML = '';

    this.quests.forEach((q, idx) => {
      const isDone = this.completedQuests.has(q.id);
      const isCurrent = idx === this.currentQuestIndex;

      const item = document.createElement('div');
      item.className = `quest-item ${isDone ? 'completed' : ''}`;

      item.innerHTML = `
        <div class="quest-status-icon">${isDone ? '✅' : (isCurrent ? '📦' : '🔒')}</div>
        <div class="quest-details">
          <div class="quest-name">${q.title}</div>
          <div class="quest-summary">${q.description}</div>
        </div>
      `;
      container.appendChild(item);
    });
  }
}

window.QuestManager = QuestManager;
