const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient();

function formatDateTime (isoString) {
    const date = new Date(isoString);

    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Months are zero-based
    const year = date.getUTCFullYear();

    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');

    const formattedDate = `${day}-${month}-${year}`;
    const formattedTime = `${hours}:${minutes}`;

    return {
        date: formattedDate,
        time: formattedTime
    };
}

async function getGroup(req, res) {
    const {groupId} = req.params;
    const groupID = parseInt(groupId)

    if (isNaN(groupID)) {
        return res.status(400).json({ message: 'Invalid group ID.' });
    }

    try {
        const group = await prisma.group.findUnique({
            where: {
                id: groupID
            },
            include: {
                members: true
            }
        })


        if (!group) return res.status(404).json({message: 'Group not found.'})

         // Format createdAt to desired format
         const formattedDateTime = formatDateTime(group.createdAt);

         // Create a new user object with formatted date and time
         const newGroup = {
             ...group,
             createdAtDate: formattedDateTime.date,
             createdAtTime: formattedDateTime.time
         };

         if (newGroup.name === null) {
            const groupUsernames = []
            group.members.map(member => groupUsernames.push(member.username));
            newGroup.name = groupUsernames.slice(0, groupUsernames.length - 1).join(', ') + ' & ' + groupUsernames.slice(groupUsernames.length - 1);
         }

         return res.json(newGroup); 
    } catch (err) {
        console.log(err)
        return res.status(500).json({message: 'An unknown error occured when trying to getGroup data.'})
    }
}

async function createDirectMessage(req, res) {
    const { members } = req.body;
    const user = members[0];

    // Validate members array
    if (!members || members.length === 0) {
        return res.status(400).json({ message: 'Group must have at least one member.' });
    }

    const directMsg = true;

    try {
        
        const existingGroup = await prisma.group.findFirst({
            where: {
                directMsg,
                members: {
                    every: { id: { in: members.map(member => member.id) } }
                },
            },
            include: {
                members: true,
                messages: true,
            },
        });

        if (existingGroup) {
            personalisedGroupName(existingGroup, user.id);
            return res.json({existingGroup, message: 'Direct message group already exists.' });
        }

        // Create new group
        const createdGroup = await prisma.group.create({
            data: {
                directMsg,
                members: {
                    connect: members.map(member => ({ id: member.id })),
                },
            },
        });

        // Fetch the group with its related data (members and messages)
        const newGroup = await prisma.group.findUnique({
            where: { id: createdGroup.id },
            include: {
                members: true,
                messages: true,
            },
        });

        // Handle potential error in creation
        if (!newGroup) {
            return res.status(500).json({ message: 'An error occurred when trying to create the group.' });
        }

        // Respond with the created group
        personalisedGroupName(newGroup, user.id);
        res.status(201).json({ newGroup });

    } catch (err) {
        // Log and respond with detailed error
        console.error('Error creating group:', err);
        res.status(500).json({ message: err.message || 'An unknown error occurred.' });
    }
}

async function createGroup(req, res) {
    const { members } = req.body;
    const parsedMembers = JSON.parse(members); // Parse members once

    // Set the group name: use provided name or generate one
    const groupName = req.body.name || nameGroup(parsedMembers);

    const groupPhotoUrl = req.file ? req.file.path : process.env.DEFAULT_GROUP_PICTURE; // Multer will add file information here
    
    const directMsg = false;
    console.log(groupName);
    console.log(groupPhotoUrl);
    console.log(members)


    try {
        const existingGroup = await prisma.group.findFirst({
            where: {
                directMsg,
                name: groupName,
                members: {
                    every: { id: { in: JSON.parse(members).map(member => member.id) } }
                },
            },
            include: {
                members: true,
                messages: true,
            },
        });

        if (existingGroup) {
            return res.json({existingGroup, message: 'Direct message group already exists.' });
        }

        // Your group creation logic here
        const createdGroup = await prisma.group.create({
            data: {
                name: groupName,
                members: {
                    connect: JSON.parse(members).map(member => ({ id: member.id })),
                },
                photo: groupPhotoUrl, // Save the Cloudinary URL for the group photo
                directMsg: false,
            },
        });

        const newGroup = await prisma.group.findFirst({
            where: { id: createdGroup.id },
            include: {
                members: true,
                messages: true,
            },
        })

        res.status(201).json({ newGroup });
    } catch (err) {
        console.log(err)
        res.status(500).json({ message: 'Error creating group', error: err.message });
    }
}

function nameGroup(members) {
    const groupUsernames = []
    members.map(member => groupUsernames.push(member.username));
    return groupUsernames.slice(0, groupUsernames.length - 1).join(', ') + ' & ' + groupUsernames.slice(groupUsernames.length - 1);
}

function personalisedGroupName(group, userID) {
    if (group.members.length  <= 2) {
        const recipient = group.members.find(member => member.id !== userID);
        group.name = recipient.username;
        group.photo = recipient.photo;
    } else {
        const otherMembers = group.members.filter(member => member.id !== userID);
        const otherMembersUsernames = []
        otherMembers.forEach(member => otherMembersUsernames.push(member.username))
        group.name = otherMembersUsernames.slice(0, otherMembersUsernames.length - 1).join(', ') + ' & ' + otherMembersUsernames.slice(otherMembersUsernames.length - 1);
    }
    if (group.photo === null) group.photo = process.env.DEFAULT_PICTURE;
}



module.exports = {
    getGroup,
    createDirectMessage,
    createGroup
}